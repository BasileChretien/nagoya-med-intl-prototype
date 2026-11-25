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
import { structuredData, missingTypes } from './structured-lib.mjs';
import { outsideResources, outsideInCss, outsideLinks } from './resources-lib.mjs';
import { PROTOTYPE } from '../src/lib/launch.mjs';
import { urlLang } from '../src/lib/url-lang.mjs';

/** Names of the checks below; feature map entries refer to them in `tests`. */
const CHECKS = ['pairing', 'programme-references', 'deadlines', 'data-files', 'images', 'internal-links', 'noindex', 'feature-map',
  'photo-descriptions', 'report-translations', 'versions-in-step', 'facts-match', 'translations-current', 'faculty-texts', 'faculty-live', 'acronyms', 'content-plugin',
  'structured-data', 'sitemap', 'weekly-check', 'ja-summaries', 'dated-facts', 'search-index', 'feeds', 'no-outside-resources'];

// fileURLToPath decodes %20 and non-ASCII characters, so the check runs from any folder.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = join(ROOT, 'src', 'content', 'pages');
const DATA = join(ROOT, 'src', 'data');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');
const BASE = '/nagoya-med-intl-prototype';
const MAX_IMAGE_KB = 300;
const today = new Date().toISOString().slice(0, 10);
// Dates written by the office are Japan dates: a fact checked this morning in Nagoya is not "in the future".
const todayJapan = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
/** A real calendar date written YYYY-MM-DD (not 2026-02-30). @param {unknown} s */
const isDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const time = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === s;
};

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
  // A passed "open" deadline is shown as closed at the next build (src/lib/calendar.ts shownStatus), so it no longer
  // stops a deploy; the warning stays, and the weekly check opens an issue, until the data is updated.
  if (d?.status === 'open' && d.date && d.date < todayJapan) warn(`programmes/${id}.json: deadline ${d.date} has passed but status is "open": the site shows it as closed; set the status to "tba" (or "closed") and update the text`);
  else if (d?.date && d.date < todayJapan && d.status !== 'closed' && d.status !== 'tba') warn(`programmes/${id}.json: deadline ${d.date} has passed`);
  // The fact box shows when the facts were last compared with their sources.
  if (!isDate(p.checked) || p.checked > todayJapan) fail(`programmes/${id}.json: "checked" must be the date the facts were last compared with their sources (YYYY-MM-DD, not in the future)`);
  else if (p.checked < yearAgo) warn(`programmes/${id}.json: facts last checked on ${p.checked}, more than a year ago: compare them with the sources again`);
}
// Pages show the date their content was taken from the sources (`updated`).
for (const lang of ['en', 'ja']) {
  for (const p of md(lang)) {
    const updated = frontMatter(join(PAGES, lang, p)).updated;
    if (!updated) fail(`${lang}/${p}: no "updated" date`);
    else if (!isDate(updated) || updated > todayJapan) fail(`${lang}/${p}: "updated" must be a date (YYYY-MM-DD, not in the future)`);
    else if (updated < yearAgo) warn(`${lang}/${p}: content last checked on ${updated}, more than a year ago: compare it with the sources again`);
  }
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

// 3d. Every acronym in the pages and in the programme, contact, partner, news and summary texts is explained in
//     glossary.json. Content pages mark it where it is first used (src/lib/rehype-abbr.mjs); acronyms in titles
//     and data texts are explained on the glossary page.
const glossary = readList('glossary.json');
if (glossary) {
  const known = new Set();
  for (const g of glossary) {
    if (typeof g.term !== 'string' || !g.term) { fail('glossary.json: an entry has no "term"'); continue; }
    if (known.has(g.term)) fail(`glossary.json: ${g.term} is listed twice`);
    known.add(g.term);
    for (const l of ['en', 'ja']) if (typeof g[l] !== 'string' || !g[l].trim()) fail(`glossary.json ${g.term}: no ${l} text`);
    for (const l of ['en', 'ja']) if (g.url?.[l] !== undefined && !/^https:\/\//.test(g.url[l])) fail(`glossary.json ${g.term}: url.${l} must start with https://`);
  }
  // Currency codes, Roman numerals and words written in capitals that are not abbreviations.
  const NOT_ACRONYMS = new Set(['JPY', 'USD', 'GBP', 'EUR', 'FAX', 'II', 'III', 'IV', 'HK', 'JAPAN', 'OK']);
  /** Words of letters (split at digits and signs, so PhD4GAME gives PhD and GAME) with two capitals or more, at least half capitals. */
  const acronymsIn = (text) => {
    const clean = text.normalize('NFKC').replace(/https?:\/\/\S+/g, ' ').replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/<[^>]+>/g, ' ');
    const found = new Set();
    for (const word of clean.match(/[A-Za-z]+/g) ?? []) {
      const caps = (word.match(/[A-Z]/g) ?? []).length;
      if (caps >= 2 && caps * 2 >= word.length && !NOT_ACRONYMS.has(word)) found.add(word);
    }
    return found;
  };
  const report = (where, text) => { for (const a of acronymsIn(text)) if (!known.has(a)) fail(`${where}: "${a}" is not in src/data/glossary.json: add what it stands for (and the website, for an institution)`); };
  for (const lang of ['en', 'ja']) for (const p of md(lang)) report(`${lang}/${p}`, readFileSync(join(PAGES, lang, p), 'utf8'));
  // Visible texts of the data files: skip keys that hold ids, codes, tags or addresses.
  const SKIP_KEYS = new Set(['id', 'sources', 'source', 'page', 'contact', 'section', 'url', 'status', 'date', 'category', 'countryCode', 'region', 'links', 'email', 'phone', 'fax', 'file', 'thumb', 'story', 'kind', 'programmes', 'partners', 'map',
    'evidence', 'checked', 'method']);
  const texts = (value, key = '') => {
    if (SKIP_KEYS.has(key)) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap((v) => texts(v));
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => texts(v, k));
    return [];
  };
  const dataFiles = [
    ...walk(join(DATA, 'programmes')).filter((f) => f.endsWith('.json')).map((f) => `programmes/${basename(f)}`),
    'contacts.json', 'partners.json', 'news.json', 'ja-summaries.json',
  ];
  for (const name of dataFiles) {
    const f = join(DATA, name);
    if (!existsSync(f)) continue;
    let data;
    try { data = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; } // reported above
    report(name, texts(data).join('\n'));
  }
}

// 3e. Summaries of Japanese-only pages (src/data/ja-summaries.json, shown by src/lib/rehype-abbr.mjs): each is
//     marked as written automatically, dated, short, and used by an English page; and every link from an English
//     page to a page in Japanese has one. PDF files are not required: their folder does not tell their language.
const summaries = readList('ja-summaries.json');
if (summaries) {
  const summarised = new Set();
  for (const s of summaries) {
    if (typeof s.url !== 'string' || !/^https:\/\//.test(s.url)) { fail('ja-summaries.json: an entry has no https "url"'); continue; }
    if (summarised.has(s.url)) fail(`ja-summaries.json: ${s.url} is listed twice`);
    summarised.add(s.url);
    if (typeof s.en !== 'string' || !s.en.trim()) fail(`ja-summaries.json ${s.url}: no "en" summary`);
    else if (s.en.trim().split(/\s+/).length > 70) fail(`ja-summaries.json ${s.url}: summary longer than 70 words`);
    if (s.method !== 'machine') fail(`ja-summaries.json ${s.url}: "method" must be "machine": the summaries are written automatically and the page says so`);
    // A real day (the plugin shows it), not later than today in Japan.
    if (!isDate(s.checked) || s.checked > todayJapan) fail(`ja-summaries.json ${s.url}: "checked" must be the date it was written (YYYY-MM-DD, not in the future)`);
  }
  const linkedFromEnglish = new Set();
  for (const p of md('en')) {
    const body = readFileSync(join(PAGES, 'en', p), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
    for (const link of outsideLinks(body)) {
      const url = link.split('#')[0];
      linkedFromEnglish.add(url);
      let pathname = '';
      try { pathname = new URL(url).pathname; } catch { continue; }
      if (!/\.pdf$/i.test(pathname) && urlLang(url) === 'ja' && !summarised.has(url)) {
        fail(`en/${p} links to a page in Japanese with no English summary: add ${url} to src/data/ja-summaries.json, or link its English version`);
      }
    }
  }
  for (const u of summarised) if (!linkedFromEnglish.has(u)) fail(`ja-summaries.json: no English page links to ${u}`);
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

// 6. After a build: every internal link points to a file that exists, every page is noindex while the site is a
//    prototype (src/lib/launch.mjs), structured data is well formed, and the sitemap lists the pages.
if (process.argv.includes('--dist')) {
  if (!existsSync(DIST)) fail('dist/ not found: run `astro build` first');
  const html = walk(DIST).filter((f) => f.endsWith('.html'));
  let checked = 0;
  // Pages that must carry structured data: the office on each home page, the breadcrumb trail on each content page.
  const expected = new Map([['en/index.html', ['EducationalOrganization']], ['ja/index.html', ['EducationalOrganization']]]);
  for (const lang of ['en', 'ja']) {
    for (const p of md(lang)) {
      const slug = p.replace(/\.md$/, '').replace(/(^|\/)index$/, '');
      expected.set(`${lang}/${slug ? `${slug}/` : ''}index.html`, ['BreadcrumbList']);
    }
  }
  // The site's own address (origin and base path), from the English home page's canonical address: an address under
  // it is not another site; another project on the same host is.
  const homeFile = join(DIST, 'en', 'index.html');
  const canonical = existsSync(homeFile) ? readFileSync(homeFile, 'utf8').match(/<link rel="canonical" href="([^"]+)"/)?.[1] : undefined;
  const own = canonical ? [canonical.replace(/en\/$/, '')] : [];
  // Built stylesheets too: a font or image named in CSS is loaded like one named in a page.
  for (const f of walk(DIST).filter((x) => x.endsWith('.css'))) {
    for (const url of outsideInCss(readFileSync(f, 'utf8'), own)) fail(`${relative(DIST, f).split(sep).join('/')} loads ${url} from another site: serve it from the site itself (the privacy page says nothing is loaded from elsewhere)`);
  }
  for (const f of html) {
    const text = readFileSync(f, 'utf8');
    const page = relative(DIST, f).split(sep).join('/');
    if (PROTOTYPE && !/<meta name="robots" content="noindex/.test(text)) fail(`${page} is missing the noindex meta tag`);
    const sd = structuredData(text);
    for (const problem of sd.problems) fail(`${page}: ${problem}`);
    for (const type of missingTypes(sd.blocks, expected.get(page) ?? [])) fail(`${page}: no ${type} structured data`);
    expected.delete(page);
    // The privacy page says a page loads nothing from other sites.
    for (const url of outsideResources(text, own)) fail(`${page} loads ${url} from another site: serve it from the site itself (the privacy page says nothing is loaded from elsewhere)`);
    // Links in the markup only: scripts build some hrefs from strings at run time.
    const markup = text.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    for (const m of markup.matchAll(/(?:href|src)="([^"#?]+)[^"]*"/g)) {
      const url = m[1];
      // A relative link resolves against the page's address, not its source file: content links are rewritten to
      // full addresses at build time (src/lib/rehype-abbr.mjs), so one left relative would be read wrongly.
      if (!/^([a-z][a-z0-9+.-]*:|\/)/i.test(url)) { fail(`${relative(DIST, f)} has a relative link "${url}": write it as a site link or a full address`); continue; }
      if (!url.startsWith(`${BASE}/`)) continue;
      checked += 1;
      const rel = decodeURIComponent(url.slice(BASE.length + 1));
      const target = join(DIST, rel);
      const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')));
      if (!ok) fail(`${relative(DIST, f)} links to missing ${url}`);
    }
  }
  for (const page of expected.keys()) fail(`${page} was not built, so its structured data could not be checked`);
  process.stdout.write(`Checked ${checked} internal links in ${html.length} pages.\n`);
  // The sitemap lists both home pages and leaves out the office's checklist; robots.txt never blocks crawling
  // while the pages rely on their noindex tag.
  const sitemapFile = join(DIST, 'sitemap-0.xml');
  if (!existsSync(join(DIST, 'sitemap-index.xml')) || !existsSync(sitemapFile)) fail('the sitemap was not built (sitemap-index.xml, sitemap-0.xml)');
  else {
    const sm = readFileSync(sitemapFile, 'utf8');
    for (const lang of ['en', 'ja']) if (!sm.includes(`${BASE}/${lang}/</loc>`)) fail(`the sitemap does not list the ${lang} home page`);
    if (/\/status\/<\/loc>/.test(sm)) fail('the sitemap lists the office checklist (status) page');
  }
  // The search index covers both languages; the news feed and the calendar exist in both.
  const entry = join(DIST, 'pagefind', 'pagefind-entry.json');
  if (!existsSync(entry)) fail('the search index was not built: run `npm run build` (astro build, then pagefind)');
  else {
    const languages = Object.keys(JSON.parse(readFileSync(entry, 'utf8')).languages ?? {});
    for (const lang of ['en', 'ja']) if (!languages.includes(lang)) fail(`the search index has no ${lang} pages`);
  }
  for (const lang of ['en', 'ja']) {
    const feed = join(DIST, lang, 'news', 'rss.xml');
    if (!existsSync(feed) || !/<rss version="2\.0">[\s\S]*<item>/.test(readFileSync(feed, 'utf8'))) fail(`${lang}/news/rss.xml is missing or has no items`);
    const cal = join(DIST, lang, 'calendar.ics');
    if (!existsSync(cal) || !/^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/.test(readFileSync(cal, 'utf8'))) fail(`${lang}/calendar.ics is missing or not a calendar`);
  }
  const robots = join(DIST, 'robots.txt');
  if (!existsSync(robots)) fail('robots.txt was not built');
  else if (PROTOTYPE && /^Disallow:\s*\/\s*$/m.test(readFileSync(robots, 'utf8'))) fail('robots.txt blocks crawling, which hides the noindex tag');
}

for (const w of warnings) process.stdout.write(`warning: ${w}\n`);
for (const e of errors) process.stderr.write(`error: ${e}\n`);
process.stdout.write(`${en.size} English and ${ja.size} Japanese pages; ${errors.length} errors, ${warnings.length} warnings.\n`);
process.exit(errors.length ? 1 : 0);
