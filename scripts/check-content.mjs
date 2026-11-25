#!/usr/bin/env node
/**
 * Content checks run before every deploy.
 *   node scripts/check-content.mjs          checks sources (pairing, deadlines, images, references, descriptions)
 *   node scripts/check-content.mjs --dist   also checks every internal link in the built site (run after `astro build`)
 * Exits with code 1 when a check fails, so the deploy stops.
 */
import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFeatures, drawFeatures } from './features.mjs';

/** Names of the checks below; feature map entries refer to them in `tests`. */
const CHECKS = ['pairing', 'programme-references', 'deadlines', 'data-files', 'images', 'internal-links', 'noindex', 'feature-map',
  'photo-descriptions', 'report-translations', 'versions-in-step', 'facts-match', 'translations-current', 'faculty-texts', 'faculty-live'];

// fileURLToPath decodes %20 and non-ASCII characters, so the check runs from any folder.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
// contacts.json problems are reported once, by section 3; here an unusable file only skips the contact check.
let contactIds = null;
try {
  const c = JSON.parse(readFileSync(join(DATA, 'contacts.json'), 'utf8'));
  if (Array.isArray(c)) contactIds = new Set(c.filter((x) => x && typeof x === 'object').map((x) => x.id));
} catch { /* reported by section 3 */ }
for (const f of walk(join(DATA, 'programmes')).filter((x) => x.endsWith('.json'))) {
  const id = f.split(sep).pop().replace(/\.json$/, '');
  let p;
  try { p = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { fail(`programmes/${id}.json: invalid JSON (${e.message})`); continue; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) { fail(`programmes/${id}.json: must be an object`); continue; }
  if (contactIds && !contactIds.has(p.contact)) fail(`programmes/${id}.json: unknown contact "${p.contact}"`);
  if (!slugs.has(p.page)) fail(`programmes/${id}.json: page "${p.page}" does not exist`);
  const d = p.deadline;
  if (d?.status === 'open' && d.date && d.date < today) fail(`programmes/${id}.json: deadline ${d.date} has passed but status is "open"`);
  if (d?.date && d.date < today && d.status !== 'closed' && d.status !== 'tba') warn(`programmes/${id}.json: deadline ${d.date} has passed`);
}

/** Parse a JSON file; report a failure instead of crashing. @param {string} file @returns {any} */
function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`${relative(ROOT, file).split(sep).join('/')}: invalid JSON (${e.message})`); return null; }
}

/**
 * Read a data file that must hold a list of objects. Returns the objects, or null when the file cannot be
 * used at all (missing, unparsable, not a list), in which case the checks that depend on it are skipped
 * so that one broken file gives one error instead of hundreds.
 * @param {string} name file name under src/data @returns {Record<string, any>[] | null}
 */
function readList(name) {
  const f = join(DATA, name);
  if (!existsSync(f)) { fail(`${name} is missing`); return null; }
  const data = readJson(f);
  if (data === null) return null;
  if (!Array.isArray(data)) { fail(`${name}: must be a list (a JSON array)`); return null; }
  const ok = [];
  data.forEach((x, i) => {
    if (x && typeof x === 'object' && !Array.isArray(x)) ok.push(x);
    else fail(`${name}: entry ${i} is not an object`);
  });
  return ok;
}

/** Width and height of a WebP file, read from its header; null if it is not a WebP. @param {string} file */
function webpSize(file) {
  const b = Buffer.alloc(30);
  const fd = openSync(file, 'r');
  try { readSync(fd, b, 0, 30, 0); } finally { closeSync(fd); }
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 }; }
  if (chunk === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  return null;
}

// 3. Data files parse, hold lists, and their ids are unique.
const lists = {};
for (const name of ['contacts', 'partners', 'news', 'stories']) {
  const arr = readList(`${name}.json`);
  lists[name] = arr;
  if (!arr) continue;
  const ids = arr.map((x) => x.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) fail(`${name}.json: duplicate ids ${[...new Set(dup)].join(', ')}`);
}

// 3b. Every photo has a description in both languages, its files exist with the recorded sizes,
//     and no photo file is left unlisted.
const imgs = readList('images.json');
if (imgs) {
  const listed = new Set();
  for (const im of imgs) {
    for (const l of ['en', 'ja']) {
      const alt = im.alt?.[l];
      if (typeof alt !== 'string' || !alt.trim()) fail(`images.json ${im.id}: no ${l} description`);
    }
    if (typeof im.file !== 'string' || !im.file.trim()) fail(`images.json ${im.id}: "file" must be a path under public/, such as "img/pages/x.webp"`);
    if (im.thumb !== undefined && (typeof im.thumb !== 'string' || !im.thumb.trim())) fail(`images.json ${im.id}: "thumb" must be a path under public/, such as "img/pages/x-t.webp"`);
    if (im.thumb && (!Number.isInteger(im.thumbWidth) || !Number.isInteger(im.thumbHeight))) {
      fail(`images.json ${im.id}: a photo with a thumbnail needs thumbWidth and thumbHeight`);
    }
    for (const [f, w, h] of [[im.file, im.width, im.height], [im.thumb, im.thumbWidth, im.thumbHeight]]) {
      if (typeof f !== 'string' || !f) continue;
      listed.add(f);
      const path = join(PUBLIC, f);
      if (!existsSync(path)) { fail(`images.json ${im.id}: missing file public/${f}`); continue; }
      const size = webpSize(path);
      if (!size) { fail(`images.json ${im.id}: public/${f} is not a WebP file`); continue; }
      if (Number.isInteger(w) && Number.isInteger(h) && (size.w !== w || size.h !== h)) {
        fail(`images.json ${im.id}: recorded size ${w}x${h} does not match public/${f} (${size.w}x${size.h})`);
      }
    }
  }
  // Every file under public/img, whatever its type, must be listed with a description. Exempt: the home page's
  // campus photo (decorative, alt="", behind the title) and files the operating system writes on its own.
  const OS_FILES = /^(thumbs\.db|desktop\.ini|\.ds_store|\._.*)$/i;
  for (const f of walk(join(PUBLIC, 'img'))) {
    const rel = relative(PUBLIC, f).split(sep).join('/');
    if (OS_FILES.test(basename(f)) || /^img\/campus-\d+\.webp$/.test(rel)) continue;
    if (!listed.has(rel)) fail(`public/${rel} is not in images.json: add it there with a description in both languages, or delete it`);
  }
}

// 3c. Every student report exists in its original language and as an automatic translation, paragraph for paragraph.
const stories = lists.stories;
if (stories) {
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
  // Only the files directly in each folder, as the content loaders read them (glob "*.json", not subfolders).
  for (const dir of ['original', 'translated']) {
    const folder = join(DATA, 'reports', dir);
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder).filter((n) => n.endsWith('.json') && statSync(join(folder, n)).isFile())) {
      const id = name.replace(/\.json$/, '');
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
