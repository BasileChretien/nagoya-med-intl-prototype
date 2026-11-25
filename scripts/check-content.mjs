#!/usr/bin/env node
/**
 * Content checks run before every deploy.
 *   node scripts/check-content.mjs          checks sources (pairing, deadlines, images, references, descriptions)
 *   node scripts/check-content.mjs --dist   also checks every internal link in the built site (run after `astro build`)
 * Exits with code 1 when a check fails, so the deploy stops.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { readFeatures, drawFeatures } from './features.mjs';

/** Names of the checks below; feature map entries refer to them in `tests`. */
const CHECKS = ['pairing', 'programme-references', 'deadlines', 'data-files', 'images', 'internal-links', 'noindex', 'feature-map',
  'photo-descriptions', 'report-translations'];

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PAGES = join(ROOT, 'src', 'content', 'pages');
const DATA = join(ROOT, 'src', 'data');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');
const BASE = '/nagoya-med-intl-prototype';
const MAX_IMAGE_KB = 300;
const today = new Date().toISOString().slice(0, 10);

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** @param {string} file @returns {Record<string, string>} */
function frontMatter(file) {
  const text = readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// 1. Every page exists in both languages, with a title and a description.
const md = (lang) => walk(join(PAGES, lang)).filter((f) => f.endsWith('.md')).map((f) => relative(join(PAGES, lang), f).split(sep).join('/'));
const en = new Set(md('en'));
const ja = new Set(md('ja'));
for (const p of en) if (!ja.has(p)) fail(`Missing Japanese page for en/${p}`);
for (const p of ja) if (!en.has(p)) fail(`Missing English page for ja/${p}`);
for (const lang of ['en', 'ja']) {
  for (const p of md(lang)) {
    const fm = frontMatter(join(PAGES, lang, p));
    if (!fm.title) fail(`${lang}/${p}: no title`);
    if (!fm.description) fail(`${lang}/${p}: no description`);
    else if ([...fm.description].length > 160) warn(`${lang}/${p}: description longer than 160 characters`);
  }
}
const slugs = new Set([...en].map((p) => p.replace(/\.md$/, '').replace(/\/index$/, '')));

// 2. Programmes: valid JSON, known contact, existing page, no passed deadline shown as open.
const contacts = existsSync(join(DATA, 'contacts.json')) ? JSON.parse(readFileSync(join(DATA, 'contacts.json'), 'utf8')) : [];
const contactIds = new Set(contacts.map((c) => c.id));
for (const f of walk(join(DATA, 'programmes')).filter((x) => x.endsWith('.json'))) {
  const id = f.split(sep).pop().replace(/\.json$/, '');
  let p;
  try { p = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { fail(`programmes/${id}.json: invalid JSON (${e.message})`); continue; }
  if (!contactIds.has(p.contact)) fail(`programmes/${id}.json: unknown contact "${p.contact}"`);
  if (!slugs.has(p.page)) fail(`programmes/${id}.json: page "${p.page}" does not exist`);
  const d = p.deadline;
  if (d?.status === 'open' && d.date && d.date < today) fail(`programmes/${id}.json: deadline ${d.date} has passed but status is "open"`);
  if (d?.date && d.date < today && d.status !== 'closed' && d.status !== 'tba') warn(`programmes/${id}.json: deadline ${d.date} has passed`);
}

// 3. Data files parse and ids are unique.
for (const name of ['staff', 'contacts', 'partners', 'news', 'stories']) {
  const f = join(DATA, `${name}.json`);
  if (!existsSync(f)) { fail(`${name}.json is missing`); continue; }
  try {
    const arr = JSON.parse(readFileSync(f, 'utf8'));
    const ids = arr.map((x) => x.id);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dup.length) fail(`${name}.json: duplicate ids ${[...new Set(dup)].join(', ')}`);
  } catch (e) { fail(`${name}.json: invalid JSON (${e.message})`); }
}

/** Parse a JSON file; report a failure instead of crashing. @param {string} file @returns {any} */
function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`${relative(ROOT, file)}: invalid JSON (${e.message})`); return null; }
}

// 3b. Every photo has a description in both languages, its files exist, and no photo file is left unlisted.
const imagesFile = join(DATA, 'images.json');
const imgs = existsSync(imagesFile) ? readJson(imagesFile) ?? [] : [];
const listed = new Set();
for (const im of imgs) {
  for (const l of ['en', 'ja']) if (!im.alt?.[l]?.trim()) fail(`images.json ${im.id}: no ${l} description`);
  for (const f of [im.file, im.thumb].filter(Boolean)) {
    listed.add(f);
    if (!existsSync(join(PUBLIC, f))) fail(`images.json ${im.id}: missing file public/${f}`);
  }
}
// The home page's campus photo is decorative (alt="") behind the title; every other photo must be listed.
for (const f of walk(join(PUBLIC, 'img')).filter((x) => /\.(webp|jpe?g|png|avif|gif|svg)$/i.test(x))) {
  const rel = relative(PUBLIC, f).split(sep).join('/');
  if (!/^img\/campus-\d+\.webp$/.test(rel) && !listed.has(rel)) fail(`public/${rel} is not in images.json, so it has no description`);
}

// 3c. Every student report exists in its original language and as an automatic translation, paragraph for paragraph.
const storiesFile = join(DATA, 'stories.json');
if (existsSync(storiesFile)) {
  const stories = readJson(storiesFile) ?? [];
  const ids = new Set(stories.map((s) => s.id));
  let missingTr = 0;
  for (const s of stories) {
    const o = join(DATA, 'reports', 'original', `${s.id}.json`);
    const tr = join(DATA, 'reports', 'translated', `${s.id}.json`);
    if (!existsSync(o)) { fail(`report ${s.id}: no original text`); continue; }
    if (!existsSync(tr)) { missingTr += 1; continue; }
    const od = readJson(o);
    const td = readJson(tr);
    if (!od || !td) continue;
    if (!Array.isArray(od.paragraphs) || !Array.isArray(td.paragraphs)) { fail(`report ${s.id}: "paragraphs" must be a list in both files`); continue; }
    if (od.lang !== s.lang) fail(`report ${s.id}: original is "${od.lang}" but stories.json says "${s.lang}"`);
    if (td.lang === od.lang) fail(`report ${s.id}: translation is in the same language as the original`);
    if (td.method !== 'machine') fail(`report ${s.id}: translation must be labelled "machine"`);
    if (td.paragraphs.length !== od.paragraphs.length) fail(`report ${s.id}: ${td.paragraphs.length} translated paragraphs for ${od.paragraphs.length} original ones`);
    if (td.paragraphs.some((p) => typeof p !== 'string' || !p.trim())) fail(`report ${s.id}: empty translated paragraph`);
  }
  if (missingTr) fail(`${missingTr} reports have no translation`);
  for (const dir of ['original', 'translated']) {
    for (const f of walk(join(DATA, 'reports', dir)).filter((x) => x.endsWith('.json'))) {
      const id = f.split(sep).pop().replace(/\.json$/, '');
      if (!ids.has(id)) fail(`reports/${dir}/${id}.json has no story in stories.json`);
    }
  }
}

// 4. Images stay small.
for (const f of walk(PUBLIC).filter((x) => /\.(jpe?g|png|webp|avif|gif)$/i.test(x))) {
  const kb = statSync(f).size / 1024;
  if (kb > MAX_IMAGE_KB) fail(`${relative(ROOT, f)} is ${Math.round(kb)} KB (limit ${MAX_IMAGE_KB} KB)`);
}

// 5. Feature map: entries name real files and real checks, and the drawn picture is current.
const featuresFile = join(ROOT, 'docs', 'features.yaml');
if (existsSync(featuresFile)) {
  const features = readFeatures(featuresFile);
  for (const f of features) {
    for (const p of f.delivered_by ?? []) if (!existsSync(join(ROOT, p))) fail(`features.yaml ${f.id}: "${p}" does not exist`);
    for (const tname of f.tests ?? []) if (!CHECKS.includes(tname)) fail(`features.yaml ${f.id}: unknown check "${tname}"`);
    if (f.status === 'works' && !(f.tests ?? []).length) fail(`features.yaml ${f.id}: a working feature must name a check`);
  }
  const drawn = join(ROOT, 'docs', 'features.md');
  if (!existsSync(drawn) || readFileSync(drawn, 'utf8').replace(/\r\n/g, '\n') !== drawFeatures(features)) {
    fail('docs/features.md is out of date: run node scripts/draw-features.mjs');
  }
} else fail('docs/features.yaml is missing');

// 6. After a build: every internal link points to a file that exists, and every page is noindex.
if (process.argv.includes('--dist')) {
  if (!existsSync(DIST)) fail('dist/ not found: run `astro build` first');
  const html = walk(DIST).filter((f) => f.endsWith('.html'));
  let checked = 0;
  for (const f of html) {
    const text = readFileSync(f, 'utf8');
    if (!/<meta name="robots" content="noindex/.test(text)) fail(`${relative(DIST, f)} is missing the noindex meta tag`);
    for (const m of text.matchAll(/(?:href|src)="([^"#?]+)[^"]*"/g)) {
      const url = m[1];
      if (!url.startsWith(`${BASE}/`)) continue;
      checked += 1;
      const rel = decodeURIComponent(url.slice(BASE.length + 1));
      const target = join(DIST, rel);
      const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')));
      if (!ok) fail(`${relative(DIST, f)} links to missing ${url}`);
    }
  }
  process.stdout.write(`Checked ${checked} internal links in ${html.length} pages.\n`);
}

for (const w of warnings) process.stdout.write(`warning: ${w}\n`);
for (const e of errors) process.stderr.write(`error: ${e}\n`);
process.stdout.write(`${en.size} English and ${ja.size} Japanese pages; ${errors.length} errors, ${warnings.length} warnings.\n`);
process.exit(errors.length ? 1 : 0);
