#!/usr/bin/env node
/**
 * Tests for the staleness checks: no language version, translation or faculty text may fall behind another.
 * Each case changes the tree, runs scripts/check-staleness.mjs, compares the outcome and restores the tree.
 * The faculty comparison is tested on saved copies of the faculty pages (tests/fixtures/faculty/).
 * Run: node scripts/test-staleness.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseFacultyPage, evaluateFaculty, loadFacultyConfig } from './faculty-live-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const node = (script, args = []) => spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8' });
const check = () => node('check-staleness.mjs');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SYNC = 'content-sync.json';

let failed = 0;
const say = (ok, name, why = '') => { process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}${why && !ok ? ` (${why})` : ''}\n`); if (!ok) failed += 1; };

/** Run fn with files temporarily changed; every touched file (and the sync registry) is restored afterwards. */
function withChanges(changes, fn) {
  const saved = new Map();
  const keep = (p) => { if (!saved.has(p)) saved.set(p, existsSync(join(ROOT, p)) ? read(p) : null); };
  keep(SYNC);
  try {
    for (const [p, change] of changes) {
      keep(p);
      const abs = join(ROOT, p);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, typeof change === 'function' ? change(read(p)) : change);
    }
    return fn();
  } finally {
    for (const [p, content] of saved) {
      const abs = join(ROOT, p);
      if (content === null) rmSync(abs, { force: true }); else writeFileSync(abs, content);
    }
  }
}

const expectFail = (name, changes, message, before) => withChanges(changes, () => {
  if (before) before();
  const r = check();
  say(r.status === 1 && message.test(r.stderr), name, r.status !== 1 ? `exit ${r.status}` : `missing ${message}: ${r.stderr.slice(0, 300)}`);
});
const expectPass = (name, changes, before) => withChanges(changes, () => {
  if (before) before();
  const r = check();
  say(r.status === 0, name, r.stderr.slice(0, 300));
});

const EN = 'src/content/pages/en/study-in-nagoya/faq.md';
const JA = 'src/content/pages/ja/study-in-nagoya/faq.md';
const append = (text) => (old) => `${old.trimEnd()}\n\n${text}\n`;

// Baseline
{
  const r = check();
  if (r.status !== 0) { process.stderr.write(`FAIL baseline: the staleness check must pass on the clean tree\n${r.stderr}\n`); process.exit(1); }
  say(true, 'baseline: everything is in step');
}

// Pages: one language changed, both changed, dates only, new pair never confirmed, confirming fixes it
expectFail('an English page changed alone makes its Japanese page stale', [[EN, append('An extra sentence.')]],
  /ja\/study-in-nagoya\/faq is stale: en\/study-in-nagoya\/faq changed/);
expectFail('a Japanese page changed alone makes its English page stale', [[JA, append('追加の文です。')]],
  /en\/study-in-nagoya\/faq is stale: ja\/study-in-nagoya\/faq changed/);
expectFail('both pages changed must be confirmed again', [[EN, append('An extra sentence.')], [JA, append('追加の文です。')]],
  /en\/study-in-nagoya\/faq and ja\/study-in-nagoya\/faq both changed/);
expectPass('changing only the "updated" date does not count as a change',
  [[EN, (o) => o.replace(/^updated: .*$/m, 'updated: 2030-01-01')], [JA, (o) => o.replace(/^updated: .*$/m, 'updated: 2030-01-01')]]);
expectFail('a new page pair must be confirmed once both languages exist', [
  ['src/content/pages/en/about/zz-test.md', '---\ntitle: Test\ndescription: Test page\nsection: about\n---\nText.\n'],
  ['src/content/pages/ja/about/zz-test.md', '---\ntitle: テスト\ndescription: テストのページです\nsection: about\n---\n本文です。\n'],
], /about\/zz-test has never been confirmed in both languages/);
expectPass('confirming a pair after updating both makes it pass', [[EN, append('An extra sentence.')], [JA, append('追加の文です。')]],
  () => { const r = node('sync.mjs', ['confirm', 'study-in-nagoya/faq']); if (r.status !== 0) throw new Error(r.stderr); });

// Data: bilingual fields
const PROG = 'src/data/programmes/clinical-clerkship.json';
const setField = (lang, value) => (old) => { const d = JSON.parse(old); d.duration[lang] = value; return JSON.stringify(d, null, 2); };
expectFail('a fact changed in English only makes the Japanese stale', [[PROG, setField('en', '2 to 8 weeks')]],
  /programmes\/clinical-clerkship\.json#duration: ja is stale/);
expectFail('a fact changed in Japanese only makes the English stale', [[PROG, setField('ja', '2〜8週間')]],
  /programmes\/clinical-clerkship\.json#duration: en is stale/);
expectFail('facts confirmed in both languages must still give the same numbers',
  [[PROG, (o) => { const d = JSON.parse(o); d.duration = { en: '2 to 8 weeks', ja: '3〜8週間' }; return JSON.stringify(d, null, 2); }]],
  /programmes\/clinical-clerkship\.json#duration: numbers differ/,
  () => { const r = node('sync.mjs', ['confirm', 'programmes/clinical-clerkship.json#duration']); if (r.status !== 0) throw new Error(r.stderr); });
expectPass('the same numbers written differently match (万, million, ordinals, kanji numerals)',
  [[PROG, (o) => { const d = JSON.parse(o); d.funding = { en: 'Up to JPY 1.5 million for the first three students, 80,000 yen a month', ja: '最初の三人に最大150万円、月額8万円' }; return JSON.stringify(d, null, 2); }]],
  () => { const r = node('sync.mjs', ['confirm', 'programmes/clinical-clerkship.json#funding']); if (r.status !== 0) throw new Error(r.stderr); });
expectPass('a shared 万 in a range, kanji 千, "billion" and month abbreviations match, and the acronym SEP is not a month',
  [[PROG, (o) => { const d = JSON.parse(o); d.funding = { en: '20,000 to 30,000 yen a month for 3,000 students from a JPY 1 billion fund, until Apr 15 under the SEP agreement', ja: '10億円の基金から三千人の学生に月額2〜3万円、4月15日まで' }; return JSON.stringify(d, null, 2); }]],
  () => { const r = node('sync.mjs', ['confirm', 'programmes/clinical-clerkship.json#funding']); if (r.status !== 0) throw new Error(r.stderr); });
expectFail('a field given in one language only is reported', [[PROG, (o) => { const d = JSON.parse(o); d.duration = { en: '2 to 8 weeks' }; return JSON.stringify(d, null, 2); }]],
  /programmes\/clinical-clerkship\.json#duration: has en but no ja text/);
expectFail('a photo description changed in one language only is stale', [['src/data/images.json', (o) => o.replace(/"en": "([^"]+)"/, '"en": "$1 Changed."')]],
  /images\.json#[^:]+\/alt: ja is stale/);

// Reports: the translation records which version of the original it was made from
{
  const id = JSON.parse(read('src/data/stories.json'))[0].id;
  expectFail('changing an original report makes its translation stale',
    [[`src/data/reports/original/${id}.json`, (o) => { const d = JSON.parse(o); d.paragraphs[0] += ' (edited)'; return JSON.stringify(d, null, 1); }]],
    new RegExp(`report ${id}: the translation is stale`));
}

// Faculty texts are generated from the site's data
expectFail('a faculty text edited by hand is reported as out of date', [['faculty/units-page.en.md', append('Hand edit.')]],
  /faculty\/units-page\.en\.md is out of date/);
expectFail('a programme renamed in the data makes the faculty texts out of date',
  [[PROG, (o) => { const d = JSON.parse(o); d.name.en += ' (renamed)'; d.name.ja += '（改称）'; return JSON.stringify(d, null, 2); }]],
  /faculty\/international-section\.en\.md is out of date/,
  () => { const r = node('sync.mjs', ['confirm', 'programmes/clinical-clerkship.json#name']); if (r.status !== 0) throw new Error(r.stderr); });

// The Units page title names the same thing in both languages: the office and its department
{
  const [en, ja] = ['en', 'ja'].map((l) => read(`faculty/units-page.${l}.md`).split('\n')[0]);
  say(/Office of International Affairs/.test(en) && /Department of International Medical Education/.test(en) && /国際連携室/.test(ja) && /国際医学教育学/.test(ja),
    'the Units page title names the office and the department in both languages', `${en} / ${ja}`);
}

// "sync status" lists everything the check fails on, not only page and field fingerprints
{
  const id = JSON.parse(read('src/data/stories.json'))[0].id;
  withChanges([[`src/data/reports/original/${id}.json`, (o) => { const d = JSON.parse(o); d.paragraphs[0] += ' (edited)'; return JSON.stringify(d, null, 1); }]], () => {
    const r = node('sync.mjs', ['status']);
    say(r.status === 1 && new RegExp(`report ${id}: the translation is stale`).test(r.stdout), '"sync status" lists a stale report translation', `exit ${r.status}: ${r.stdout.slice(-200)}`);
  });
}

// The registry may not keep entries for content that no longer exists
expectFail('a confirmation left for a removed page is reported', [[SYNC, (o) => { const d = JSON.parse(o); d.pages['about/zz-gone'] = { en: 'x', ja: 'y' }; return JSON.stringify(d, null, 1); }]],
  /content-sync\.json lists about\/zz-gone, which no longer exists/);

// Faculty layer, on saved copies of the live pages
{
  const cfg = loadFacultyConfig(ROOT);
  const fx = (name) => readFileSync(join(ROOT, 'tests', 'fixtures', 'faculty', `${name}.html`), 'utf8');
  const pages = ['directory-en', 'directory-ja', 'units-en', 'units-ja', 'international-en', 'international-ja'];
  const run = (overrides = {}, c = cfg) => evaluateFaculty(pages.map((p) => {
    const [kind, lang] = p.split('-');
    return analyseFacultyPage(overrides[p] ?? fx(p), { kind, lang }, c);
  }), c);

  const live = run();
  // A gap recorded in faculty.json (knownGaps) is listed, not failed, so that new drift still turns the job red.
  say(live.failures.length === 0 && live.known.some((k) => /units \(ja\).*office address/.test(k)),
    'the Japanese Units page without the office address is listed as a known gap, not a failure', JSON.stringify({ failures: live.failures, known: live.known }));
  const noGaps = run({}, { ...cfg, knownGaps: [] });
  say(noGaps.failures.some((f) => /units \(ja\).*office address/.test(f)), 'without the known gap, the Japanese Units page without the office address fails', JSON.stringify(noGaps.failures));
  // A known gap covers its own rule on its own page, nothing else.
  const unitsJaNoLink = run({ 'units-ja': fx('units-ja').replace(/href="[^"]*\/intlexch\/(japanese\/index\.html)?"/g, 'href="https://example.org/"') });
  say(unitsJaNoLink.failures.some((f) => /units \(ja\).*does not link to the international site/.test(f)),
    'a known gap does not hide another rule failing on the same page', JSON.stringify(unitsJaNoLink.failures));
  // Once the faculty fixes the page, the gap must be removed: the check fails until it is.
  const fixedUnits = run({ 'units-ja': fx('units-ja').replace('</body>', '<p>med-intl◎t.mail.nagoya-u.ac.jp</p></body>') });
  say(fixedUnits.failures.some((f) => /units \(ja\).*now gives the office address.*remove .*knownGaps/.test(f)),
    'a known gap that no longer happens is reported, so it is removed', JSON.stringify(fixedUnits.failures));
  const badGap = run({}, { ...cfg, knownGaps: [...cfg.knownGaps, { rule: 'linksToSite', page: 'international', lang: 'en', since: '2026-11-25' }] });
  say(badGap.failures.some((f) => /knownGaps.*linksToSite.*international \(en\).*not checked/.test(f)),
    'a known gap for a page its rule does not check is reported', JSON.stringify(badGap.failures));
  // Known gaps only for rules that pass or fail (recorded review items of #4): a gap on the gateway rule, which
  // counts links, could hide the page getting worse; a rule with no code behind it would never be matched.
  const gapWith = (extra, c = cfg) => { try { return run({}, { ...c, knownGaps: [...cfg.knownGaps, extra] }); } catch (e) { return { failures: [`threw ${e.message}`] }; } };
  const gatewayGap = gapWith({ rule: 'gateway', page: 'international', lang: 'en', since: '2026-11-25', note: 'x' });
  const noCodeGap = gapWith({ rule: 'newRule', page: 'units', lang: 'en', since: '2026-11-25', note: 'x' },
    { ...cfg, liveChecks: { ...cfg.liveChecks, newRule: { status: 'active', pages: ['units'] } } });
  const protoGap = gapWith({ rule: 'constructor', page: 'units', lang: 'ja', since: '2026-11-25', note: 'x' });
  say([gatewayGap, noCodeGap, protoGap].every((r) => r.failures.some((f) => /knownGaps: .*only officeAddress or linksToSite/.test(f))),
    'a known gap is accepted only for the rules that pass or fail, without a crash', JSON.stringify([gatewayGap, noCodeGap, protoGap].map((r) => r.failures)));
  const undated = gapWith({ rule: 'linksToSite', page: 'units', lang: 'en', note: 'x' });
  const unexplained = gapWith({ rule: 'linksToSite', page: 'units', lang: 'en', since: '2026-11-25' });
  say(undated.failures.some((f) => /knownGaps: .*"since"/.test(f)) && unexplained.failures.some((f) => /knownGaps: .*"note"/.test(f)),
    'a known gap without a date or a note is reported', JSON.stringify([undated.failures, unexplained.failures]));
  // The gateway rule says what is missing: a page linking every programme but not the home is not "0 of N" (#3, round 2).
  const allProgrammes = cfg.programmePages.map((p) => `<a href="${cfg.site.production}en/${p}/">x</a>`).join('');
  const gw = run({ 'international-en': `<html><body>${allProgrammes}</body></html>` });
  const gwMsg = gw.pending.find((p) => /^international \(en\)/.test(p)) ?? '';
  say(/does not yet link to the site's home page \(pending\)$/.test(gwMsg), 'the gateway rule names only what is missing', gwMsg);
  // Relative, protocol-relative and www-less links to the site's home count (#3, round 2).
  const relMisses = ['/intlexch/', '//www.med.nagoya-u.ac.jp/intlexch/', 'https://med.nagoya-u.ac.jp/intlexch/', '../../../../../intlexch/']
    .filter((h) => run({ 'units-en': fx('units-en').replace(/href="[^"]*\/intlexch\/"/g, `href="${h}"`) }).failures.some((f) => /units \(en\).*does not link/.test(f)));
  say(relMisses.length === 0, 'relative and www-less links to the site\'s home count', JSON.stringify(relMisses));
  say(!live.failures.some((f) => /directory/.test(f)), 'the directory entries give the office address and link to the site', JSON.stringify(live.failures));
  say(live.pending.some((p) => /international \((en|ja)\).*not yet/.test(p)) && !live.failures.some((f) => /^international/.test(f)),
    'the International section not linking to the site yet is pending, not a failure', JSON.stringify(live.pending));
  const noLink = run({ 'directory-en': fx('directory-en').replaceAll('/intlexch/', '/somewhere-else/') });
  say(noLink.failures.some((f) => /directory \(en\).*does not link to the international site/.test(f)), 'a directory entry that stops linking to the site is reported');
  const wrongMail = run({ 'directory-ja': fx('directory-ja').replaceAll('med-intl◎t.mail.nagoya-u.ac.jp', 'old-office◎med.nagoya-u.ac.jp') });
  say(wrongMail.failures.some((f) => /directory \(ja\).*office address/.test(f)), 'a directory entry with another contact address is reported');
  // Only a link to the site's home counts: the cancer centre's pages under /intlexch/cancerimmuno/ do not.
  const homeGone = run({ 'units-en': fx('units-en').replace(/href="[^"]*\/intlexch\/"/g, 'href="https://example.org/"') });
  say(homeGone.failures.some((f) => /units \(en\).*does not link to the international site/.test(f)),
    'a page that keeps only a link to another page under /intlexch/ is reported', JSON.stringify(homeGone.failures));
  // The old homes (japanese/, english/) and the new language homes still count as the site's home.
  const oldHome = run({ 'units-ja': fx('units-ja').replace(/href="[^"]*\/intlexch\/"/g, 'href="https://example.org/"') });
  const homeMisses = ['english/index.html', 'english/', 'en/', 'en/index.html', 'ja/', 'ja/index.html', 'japanese/', 'index.html']
    .filter((h) => run({ 'directory-en': fx('directory-en').replace(/href="[^"]*\/intlexch\/"/g, `href="https://www.med.nagoya-u.ac.jp/intlexch/${h}"`) })
      .failures.some((f) => /directory \(en\).*does not link/.test(f)));
  say(!oldHome.failures.some((f) => /units \(ja\).*does not link/.test(f)) && homeMisses.length === 0,
    'a link to any old or new home of the site counts', JSON.stringify({ oldHome: oldHome.failures, homeMisses }));
}

const total = 36;
process.stdout.write(`${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
