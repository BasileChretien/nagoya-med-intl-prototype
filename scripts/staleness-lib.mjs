/**
 * Keeping every version in step.
 *
 * Every English/Japanese page pair and every bilingual data field ({ en, ja }) has an entry in content-sync.json
 * holding a fingerprint of each language as it was when the two were last confirmed to say the same thing.
 * If one language changes and the other does not, the other is stale. Translations of student reports record
 * the fingerprint of the original they were made from. Facts (programmes, contacts, partners) must also give
 * the same numbers in both languages.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SYNC_FILE = 'content-sync.json';

/** Short fingerprint of a text. @param {string} s */
export const fingerprint = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

const lf = (s) => s.replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- pages

/** What a page's text says: everything but the "updated:" date. @param {string} text */
export const pageText = (text) => lf(text).split('\n').filter((l) => !/^updated:\s/.test(l)).map((l) => l.trimEnd()).join('\n').trim();

/** The content of a page file that counts as "what it says" (see pageText). */
export function pageContent(file) {
  return pageText(readFileSync(file, 'utf8'));
}

/** @param {string} dir @returns {string[]} paths of .md files relative to dir, with forward slashes */
function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return markdownFiles(p).map((q) => `${name}/${q}`);
    return name.endsWith('.md') ? [name] : [];
  });
}

/** "study-in-nagoya/faq.md" -> "study-in-nagoya/faq"; "about/index.md" -> "about" (the site's slugs). */
export const slugOf = (rel) => rel.replace(/\.md$/, '').replace(/\/index$/, '');

/** @returns {Record<string, { en: string, ja: string }>} fingerprints of every page that exists in both languages */
export function pagePairs(root) {
  const base = join(root, 'src', 'content', 'pages');
  const ja = new Map(markdownFiles(join(base, 'ja')).map((p) => [slugOf(p), join(base, 'ja', p)]));
  const pairs = {};
  for (const p of markdownFiles(join(base, 'en'))) {
    const slug = slugOf(p);
    if (ja.has(slug)) pairs[slug] = { en: fingerprint(pageContent(join(base, 'en', p))), ja: fingerprint(pageContent(ja.get(slug))) };
  }
  return pairs;
}

// ---------------------------------------------------------------- data fields

/** The top-level data files with bilingual fields (besides programmes/*.json, which are facts). */
export const LIST_DATA_FILES = [
  { file: 'contacts.json', facts: true },
  { file: 'partners.json', facts: true },
  { file: 'news.json', facts: false },
  { file: 'images.json', facts: false },
];

/**
 * Whether a data file (named as under src/data, "programmes/x.json" or "news.json") is compared between languages,
 * and whether its numbers must match. @returns {{ file: string, facts: boolean } | null}
 */
export function dataFileOf(file) {
  if (/^programmes\/[^/]+\.json$/.test(file)) return { file, facts: true };
  return LIST_DATA_FILES.find((d) => d.file === file) ?? null;
}

/** Data files with bilingual fields, and whether their numbers must match (facts) or not (descriptions, news). */
export function dataFiles(root) {
  const data = join(root, 'src', 'data');
  const programmes = existsSync(join(data, 'programmes'))
    ? readdirSync(join(data, 'programmes')).filter((n) => n.endsWith('.json')).map((n) => ({ file: `programmes/${n}`, facts: true }))
    : [];
  return [...programmes, ...LIST_DATA_FILES].filter((f) => existsSync(join(data, f.file)));
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isPair = (v) => isObject(v) && typeof v.en === 'string' && typeof v.ja === 'string';
const looksBilingual = (v) => isObject(v) && (Object.hasOwn(v, 'en') || Object.hasOwn(v, 'ja'));

/** Why an object with "en" or "ja" is not a usable pair. @returns {string} */
function halfPairProblem(v) {
  if (typeof v.en === 'string' && !Object.hasOwn(v, 'ja')) return 'has en but no ja text: give both languages';
  if (typeof v.ja === 'string' && !Object.hasOwn(v, 'en')) return 'has ja but no en text: give both languages';
  return '"en" and "ja" must both be text';
}

/**
 * Every { en, ja } field, keyed "programmes/x.json#deadline/text" or "images.json#<entry id>/alt", and every object
 * that has only one of the two languages (or a language that is not text): such a field is not in step with
 * anything, so it is reported instead of silently left out.
 * @returns {{ fields: Record<string, { en: string, ja: string, enText: string, jaText: string, facts: boolean }>, halves: string[] }}
 */
export function scanData(root) {
  const out = {};
  const halves = [];
  for (const { file, facts } of dataFiles(root)) {
    let data;
    try { data = JSON.parse(readFileSync(join(root, 'src', 'data', file), 'utf8')); } catch { continue; } // reported by check-content
    const one = scanDataFile(file, data, facts);
    Object.assign(out, one.fields);
    halves.push(...one.halves);
  }
  return { fields: out, halves };
}

/**
 * The { en, ja } fields of one data file's parsed content, keyed as scanData keys them (also used on a file read at
 * an earlier commit by scripts/editor-confirm.mjs). @param {string} file name under src/data @param {unknown} data
 */
export function scanDataFile(file, data, facts = false) {
  const out = {};
  const halves = [];
  const walk = (value, key) => {
    if (isPair(value)) { out[key] = { en: fingerprint(value.en), ja: fingerprint(value.ja), enText: value.en, jaText: value.ja, facts }; return; }
    if (looksBilingual(value)) { halves.push(`${key}: ${halfPairProblem(value)}`); return; }
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}/${i}`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, key.endsWith('#') ? `${key}${k}` : `${key}/${k}`);
  };
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
      const { id, ...rest } = item;
      for (const [k, v] of Object.entries(rest)) walk(v, `${file}#${id}/${k}`);
    }
  } else if (data && typeof data === 'object') walk(data, `${file}#`);
  return { fields: out, halves };
}

/** Every { en, ja } field (see scanData). */
export const dataFields = (root) => scanData(root).fields;

// ---------------------------------------------------------------- numbers in facts

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const KANJI = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const KANJI_UNITS = { 十: 10, 百: 100, 千: 1000 };
const KANJI_BIG = { 万: 1e4, 億: 1e8 };
const EN_UNITS = { thousand: 1e3, million: 1e6, billion: 1e9 };
/** A kanji-only amount is read only when one of these follows it (三千人, 二百五十名, 三千万円). */
const COUNTER = /^(つ|人|名|回|か月|ヶ月|カ月|週|年|日|校|大学|件|位|期|コース|プログラム|円)/;

/**
 * A Japanese amount written with digits, kanji or both: 1万5千 = 15000, 1億2千万 = 120000000, 1.5万 = 15000,
 * 二百五十 = 250, 千万 = 10000000.
 * @param {string} s @returns {number}
 */
function jaAmount(s) {
  let total = 0, section = 0, current = null;
  for (const [tok] of s.matchAll(/\d+(?:\.\d+)?|./gu)) {
    if (/^\d/.test(tok)) current = parseFloat(tok);
    else if (KANJI[tok]) current = KANJI[tok];
    else if (KANJI_UNITS[tok]) { section += (current ?? 1) * KANJI_UNITS[tok]; current = null; }
    else if (KANJI_BIG[tok]) { section += current ?? 0; total += (section || 1) * KANJI_BIG[tok]; section = 0; current = null; }
  }
  // Six decimals remove floating-point noise (1.1万 = 11000, not 11000.000000000002) and keep scores such as 6.5.
  return Number((total + section + (current ?? 0)).toFixed(6));
}

/**
 * One Japanese amount, or the text unchanged when it is no amount. With a digit it is always an amount. A kanji-only
 * one is an amount before a counter (三千人) or when it holds 万 or 億 (約三万部, 二億の), but not when it starts with
 * 万 or 億 (万一, 億万長者) nor after 数 when it starts with a unit (数十, 数千, 数万: "several").
 * @param {string} piece @param {string | undefined} before the character before it @param {string} after the text after it
 */
function readJaPiece(piece, before, after) {
  if (/\d/.test(piece)) return String(jaAmount(piece));
  if (/^[万億]/.test(piece) || (before === '数' && /^[十百千]/.test(piece))) return piece;
  return COUNTER.test(after) || /[万億]/.test(piece) ? String(jaAmount(piece)) : piece;
}

/**
 * Whether the first number of a range shares the unit written after the second ("20 to 30 million", 2〜3万).
 * A range goes up, so it does when the first number is the smaller as written; a first number larger than the
 * second is a full amount ("500,000 to 1 million", "500 to 1 million", 500〜100万), except in a range written
 * downward or with equal ends, where the two are close ("30 to 20 million", "3 to 3 million": at most twice).
 * @param {string} a first number @param {string} b second number
 */
function sharesUnit(a, b) {
  const x = parseFloat(a), y = parseFloat(b);
  return x < y || (y > 0 && x / y <= 2);
}

/**
 * The set of numbers a text states, written the same way whatever the language:
 * 1.5 million = 150万 = 1500000; 1 billion = 10億; 15,000 = 1万5千; 20,000 to 30,000 = 2〜3万; "third" = 3年生 = 3;
 * "May" = 5月 = 5; "Apr" = 4月 = 4; 三千人 = 3000. 0 and 1 are left out: "a", "one", "single" and 1つ are written in too
 * many ways to compare.
 * @param {string} text @param {'en'|'ja'} lang @returns {string}
 */
export function numbersOf(text, lang) {
  let s = text.normalize('NFKC').replace(/(\d),(?=\d{3}\b)/g, '$1');
  if (lang === 'en') {
    // A range sharing one unit: "20 to 30 million" is "20 million to 30 million" (see sharesUnit).
    s = s.replace(/(\d+(?:\.\d+)?)\s*(to|-|–|—)\s*(\d+(?:\.\d+)?)\s*(billion|million|thousand)\b/gi,
      (m, a, sepr, b, unit) => (sharesUnit(a, b) ? `${a} ${unit} ${sepr} ${b} ${unit}` : m));
    s = s.replace(/(\d+(?:\.\d+)?)\s*(billion|million|thousand)\b/gi, (_, n, unit) => String(Math.round(parseFloat(n) * EN_UNITS[unit.toLowerCase()])));
    // Month names only in title case, so the verb "may" is not read as May, nor the acronym "SEP" as September.
    s = s.replace(/[A-Za-z]+/g, (w) => String((/^[A-Z][a-z]+$/.test(w) ? MONTHS[w.toLowerCase()] : undefined) ?? WORDS[w.toLowerCase()] ?? w));
  } else {
    // A range sharing one unit: 2〜3万 is 2万〜3万, and 2〜3千万 is 2千万〜3千万 (see sharesUnit).
    s = s.replace(/(\d+(?:\.\d+)?)\s*(〜|~|-|–|―|から)\s*(\d+(?:\.\d+)?)([千百十]?[万億]|[千百])/g,
      (m, a, sepr, b, unit) => (sharesUnit(a, b) ? `${a}${unit}${sepr}${b}${unit}` : m));
    // Every amount, digits and kanji together (1万5千, 三千万). A digit and a kanji numeral side by side are two
    // things (第2四半期 is the 2nd quarter, not 4), so a run is first split between them.
    s = s.replace(/(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万億])+/g, (run, offset, str) => {
      let at = offset;
      return run.split(/(?<=[\d.])(?=[一二三四五六七八九])|(?<=[一二三四五六七八九])(?=\d)/).map((piece) => {
        const read = readJaPiece(piece, str[at - 1], str.slice(at + piece.length));
        at += piece.length;
        return read;
      }).join(' ');
    });
  }
  const found = new Set();
  for (const n of s.match(/\d+(?:\.\d+)?/g) ?? []) { const v = Number(n); if (v > 1) found.add(v); }
  return [...found].sort((a, b) => a - b).join(', ');
}

// ---------------------------------------------------------------- comparing with the last confirmed state

export function readRegistry(root) {
  const f = join(root, SYNC_FILE);
  if (!existsSync(f)) return null;
  const r = JSON.parse(readFileSync(f, 'utf8'));
  return { pages: r.pages ?? {}, fields: r.fields ?? {} };
}

/** Write the registry sorted, in the one format sync.mjs and editor-confirm.mjs share. */
export function writeRegistry(root, registry) {
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  writeFileSync(join(root, SYNC_FILE), `${JSON.stringify({ pages: sorted(registry.pages), fields: sorted(registry.fields) }, null, 1)}\n`);
}

const confirmHint = (key) => `then run "npm run sync -- confirm ${key}"`;

/** @returns {string[]} one message per page pair that is out of step */
export function comparePages(current, confirmed) {
  const errors = [];
  for (const [slug, now] of Object.entries(current)) {
    const was = confirmed[slug];
    if (!was) { errors.push(`${slug} has never been confirmed in both languages: check that en/${slug} and ja/${slug} say the same thing, ${confirmHint(slug)}`); continue; }
    const enChanged = was.en !== now.en, jaChanged = was.ja !== now.ja;
    if (enChanged && jaChanged) errors.push(`en/${slug} and ja/${slug} both changed since the pair was last confirmed: check they say the same thing, ${confirmHint(slug)}`);
    else if (enChanged) errors.push(`ja/${slug} is stale: en/${slug} changed since the pair was last confirmed. Update ja/${slug}, ${confirmHint(slug)}`);
    else if (jaChanged) errors.push(`en/${slug} is stale: ja/${slug} changed since the pair was last confirmed. Update en/${slug}, ${confirmHint(slug)}`);
  }
  for (const slug of Object.keys(confirmed)) if (!current[slug]) errors.push(`${SYNC_FILE} lists ${slug}, which no longer exists: run "npm run sync -- prune"`);
  return errors;
}

/** @returns {string[]} one message per bilingual field that is out of step */
export function compareFields(current, confirmed) {
  const errors = [];
  for (const [key, now] of Object.entries(current)) {
    const was = confirmed[key];
    if (!was) { errors.push(`${key} has never been confirmed in both languages: check the English and Japanese say the same thing, ${confirmHint(key)}`); continue; }
    const enChanged = was.en !== now.en, jaChanged = was.ja !== now.ja;
    if (enChanged && jaChanged) errors.push(`${key}: both languages changed since last confirmed: check they say the same thing, ${confirmHint(key)}`);
    else if (enChanged) errors.push(`${key}: ja is stale (en changed since last confirmed). Update ja, ${confirmHint(key)}`);
    else if (jaChanged) errors.push(`${key}: en is stale (ja changed since last confirmed). Update en, ${confirmHint(key)}`);
  }
  for (const key of Object.keys(confirmed)) if (!current[key]) errors.push(`${SYNC_FILE} lists ${key}, which no longer exists: run "npm run sync -- prune"`);
  return errors;
}

/** @returns {string[]} facts whose two languages state different numbers */
export function compareNumbers(current) {
  const errors = [];
  for (const [key, f] of Object.entries(current)) {
    if (!f.facts) continue;
    const a = numbersOf(f.enText, 'en'), b = numbersOf(f.jaText, 'ja');
    if (a !== b) errors.push(`${key}: numbers differ between en (${a || 'none'}) and ja (${b || 'none'})`);
  }
  return errors;
}

// ---------------------------------------------------------------- student reports

/** Fingerprint of an original report (title and paragraphs). */
export const reportFingerprint = (original) => fingerprint(JSON.stringify({ title: original.title ?? null, paragraphs: original.paragraphs }));

/** @returns {string[]} translations made from an older version of their original */
export function compareReports(root) {
  const dir = join(root, 'src', 'data', 'reports');
  const errors = [];
  if (!existsSync(join(dir, 'translated'))) return errors;
  for (const name of readdirSync(join(dir, 'translated')).filter((n) => n.endsWith('.json'))) {
    const id = name.replace(/\.json$/, '');
    const originalFile = join(dir, 'original', name);
    if (!existsSync(originalFile)) continue; // reported by check-content
    let original, translation;
    try { original = JSON.parse(readFileSync(originalFile, 'utf8')); translation = JSON.parse(readFileSync(join(dir, 'translated', name), 'utf8')); } catch { continue; }
    if (!translation.sourceFingerprint) errors.push(`report ${id}: the translation does not record which version of the original it comes from: run "npm run sync -- stamp-report ${id}" after checking it`);
    else if (translation.sourceFingerprint !== reportFingerprint(original)) {
      errors.push(`report ${id}: the translation is stale (the original changed since it was translated). Update the translation, then run "npm run sync -- stamp-report ${id}"`);
    }
  }
  return errors;
}

export const relPath = (root, p) => relative(root, p).split(sep).join('/');
