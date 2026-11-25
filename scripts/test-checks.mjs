#!/usr/bin/env node
/**
 * Tests for scripts/check-content.mjs. Each case changes the tree (plants a file, or edits one and restores it),
 * runs the check, and compares the outcome with what the case expects. Run: node scripts/test-checks.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, mkdirSync, existsSync, cpSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const runCheck = (root = ROOT) => spawnSync(process.execPath, [join(root, 'scripts', 'check-content.mjs')], { cwd: root, encoding: 'utf8' });
// An uncaught exception prints "TypeError: ..." (or another *Error) at the start of a line and "    at ..." stack
// frames; the check's own failures are lines starting with "error: ".
const crashed = (r) => /^\s+at \S|^[A-Za-z]*Error: /m.test(r.stderr);
const count = (text, re) => (text.match(new RegExp(re.source, 'g')) ?? []).length;

/**
 * plant: create a file for the run. edit: replace a file's content for the run (restored after).
 * expect: 'fail' with `message`, or 'pass'. `also`: extra assertion on the run.
 * @typedef {{ name: string, plant?: [string, string], edit?: [string, (old: string) => string], expect: 'fail' | 'pass', message?: RegExp, also?: (r: any) => string | null }} Case
 */
/** @type {Case[]} */
const cases = [
  // Photo files must all be described (rounds 1-2 of the review).
  { name: 'an undescribed .gif photo is reported', plant: ['public/img/pages/zz-test.gif', 'GIF89a'], expect: 'fail', message: /public\/img\/pages\/zz-test\.gif is not in images\.json/ },
  { name: 'an undescribed .svg image is reported', plant: ['public/img/pages/zz-test.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'], expect: 'fail', message: /public\/img\/pages\/zz-test\.svg is not in images\.json/ },
  { name: 'an undescribed .webp photo is reported', plant: ['public/img/pages/zz-test.webp', 'RIFF'], expect: 'fail', message: /public\/img\/pages\/zz-test\.webp is not in images\.json/ },
  { name: 'an undescribed .bmp image is reported', plant: ['public/img/pages/zz-test.bmp', 'BM'], expect: 'fail', message: /public\/img\/pages\/zz-test\.bmp is not in images\.json/ },
  { name: 'an upper-case extension is reported', plant: ['public/img/pages/zz-test.GIF', 'GIF89a'], expect: 'fail', message: /public\/img\/pages\/zz-test\.GIF is not in images\.json/ },
  { name: 'a file with no extension is reported', plant: ['public/img/pages/zz-test', 'x'], expect: 'fail', message: /public\/img\/pages\/zz-test is not in images\.json/ },
  { name: 'only campus-N.webp is exempt, not campus-N.gif', plant: ['public/img/campus-1.gif', 'GIF89a'], expect: 'fail', message: /public\/img\/campus-1\.gif is not in images\.json/ },
  // Operating-system files are not photos (round 3). Planted in a folder the test creates, so a real
  // Thumbs.db or .DS_Store written by the OS elsewhere can neither block nor be touched by the test.
  { name: 'Thumbs.db written by Windows Explorer is ignored', plant: ['public/img/zz-test-os/Thumbs.db', 'x'], expect: 'pass' },
  { name: '.DS_Store written by macOS is ignored', plant: ['public/img/zz-test-os/.DS_Store', 'x'], expect: 'pass' },
  // Wrong-shaped data is reported, not a crash, and does not flood the output (round 1, pass 2).
  {
    name: 'images.json holding an object instead of a list is reported without a crash or a flood',
    edit: ['src/data/images.json', () => '{}'], expect: 'fail', message: /images\.json: must be a list/,
    also: (r) => (crashed(r) ? 'the check crashed' : count(r.stderr, /is not in images\.json/) > 0 ? 'unlisted-photo errors flooded the output' : null),
  },
  {
    name: 'stories.json holding an object instead of a list is reported without a crash or a flood',
    edit: ['src/data/stories.json', () => '{}'], expect: 'fail', message: /stories\.json: must be a list/,
    also: (r) => (crashed(r) ? 'the check crashed' : count(r.stderr, /has no story/) > 0 ? 'orphan errors flooded the output' : null),
  },
  {
    name: 'a stories.json that does not parse gives one error, not hundreds of orphan errors',
    edit: ['src/data/stories.json', (old) => old.replace(/\]\s*$/, ',]')], expect: 'fail', message: /stories\.json: invalid JSON/,
    also: (r) => (count(r.stderr, /has no story/) > 0 ? 'orphan errors flooded the output' : null),
  },
  {
    name: 'contacts.json holding an object instead of a list is reported without a crash or a flood',
    edit: ['src/data/contacts.json', () => '{}'], expect: 'fail', message: /contacts\.json: must be a list/,
    also: (r) => (crashed(r) ? 'the check crashed' : count(r.stderr, /unknown contact/) > 0 ? 'unknown-contact errors flooded the output' : null),
  },
  {
    name: 'a programme file holding null is reported without a crash',
    edit: ['src/data/programmes/clinical-clerkship.json', () => 'null'], expect: 'fail', message: /programmes\/clinical-clerkship\.json: must be an object/,
    also: (r) => (crashed(r) ? 'the check crashed' : null),
  },
  {
    name: 'a null entry in images.json is reported without a crash',
    edit: ['src/data/images.json', (old) => old.replace(/^\[/, '[null,')], expect: 'fail', message: /images\.json: entry 0 is not an object/,
    also: (r) => (crashed(r) ? 'the check crashed' : null),
  },
  // The orphan scan reads the same files as the site: not subfolders (round 1, pass 2).
  { name: 'a JSON file in a subfolder of reports/original is not reported as an orphan', plant: ['src/data/reports/original/zz-test-subfolder/zz-test.json', '{}'], expect: 'pass' },
  // Recorded photo sizes must match the files (round 1, pass 2: thumbnail width of tall photos).
  {
    name: 'a recorded photo width that does not match the file is reported, once per line',
    edit: ['src/data/images.json', (old) => old.replace(/"width": (\d+)/, (_, w) => `"width": ${Number(w) + 1}`)], expect: 'fail',
    message: /recorded size \d+x\d+ does not match public\/\S+ \(\d+x\d+\)$/m,
  },
  // Every acronym is explained in src/data/glossary.json (the user asked that acronyms say what they stand for).
  {
    name: 'an unexplained acronym on a page is reported',
    edit: ['src/content/pages/en/about/index.md', (old) => `${old.trimEnd()}

The XQZW office also helps.
`], expect: 'fail',
    message: /en\/about\/index\.md: "XQZW" is not in src\/data\/glossary\.json/,
  },
  {
    name: 'an unexplained acronym in a programme text is reported',
    edit: ['src/data/programmes/clinical-clerkship.json', (old) => { const d = JSON.parse(old); d.duration.en += ' (see the QZXV rules)'; return JSON.stringify(d, null, 2); }], expect: 'fail',
    message: /programmes\/clinical-clerkship\.json: "QZXV" is not in src\/data\/glossary\.json/,
  },
  {
    name: 'a glossary entry without its Japanese text is reported',
    edit: ['src/data/glossary.json', (old) => { const d = JSON.parse(old); delete d[0].ja; return JSON.stringify(d, null, 2); }], expect: 'fail',
    message: /glossary\.json \S+: no ja text/,
  },
  // Recorded review items of #2: a listed file that is not WebP, and wrong-typed entries (no crash).
  {
    name: 'a listed photo that is not a WebP file is reported',
    edit: ['src/data/images.json', (old) => old.replace(/"file": "[^"]+"/, '"file": "favicon.svg"')], expect: 'fail',
    message: /images\.json \S+: public\/favicon\.svg is not a WebP file/,
  },
  {
    name: 'a photo whose file is not a text path is reported without a crash',
    edit: ['src/data/images.json', (old) => old.replace(/"file": "[^"]+"/, '"file": 5')], expect: 'fail',
    message: /images\.json \S+: "file" must be a path/, also: (r) => (crashed(r) ? 'the check crashed' : null),
  },
  {
    name: 'a photo with an empty file path is reported',
    edit: ['src/data/images.json', (old) => old.replace(/"file": "[^"]+"/, '"file": ""')], expect: 'fail', message: /images\.json \S+: "file" must be a path/,
  },
  {
    name: 'a photo with an empty thumbnail path is reported',
    edit: ['src/data/images.json', (old) => old.replace(/"thumb": "[^"]+"/, '"thumb": ""')], expect: 'fail', message: /images\.json \S+: "thumb" must be a path/,
  },
  {
    name: 'a photo description that is not text is reported without a crash',
    edit: ['src/data/images.json', (old) => old.replace(/"alt": \{\s*"en": "[^"]*"/, '"alt": { "en": 5')], expect: 'fail',
    message: /images\.json \S+: no en description/, also: (r) => (crashed(r) ? 'the check crashed' : null),
  },
  {
    name: 'a photo with a thumbnail but no recorded thumbnail size is reported',
    edit: ['src/data/images.json', (old) => old.replace(/,\s*"thumbWidth": \d+/, '')], expect: 'fail', message: /thumbWidth/,
  },
  // Summaries of Japanese-only pages (src/data/ja-summaries.json).
  {
    name: 'an English page linking to a page in Japanese without a summary is reported',
    edit: ['src/content/pages/en/about/contact.md', (old) => `${old}\nSee the [new notice](https://www.med.nagoya-u.ac.jp/medical_J/zz-test/).\n`], expect: 'fail',
    message: /en\/about\/contact\.md links to a page in Japanese with no English summary: add https:\/\/www\.med\.nagoya-u\.ac\.jp\/medical_J\/zz-test\//,
  },
  {
    name: 'a link to a Japanese PDF needs no summary',
    edit: ['src/content/pages/en/about/contact.md', (old) => `${old}\nSee the [form](https://www.med.nagoya-u.ac.jp/medical_J/zz-test.pdf).\n`], expect: 'pass',
  },
  {
    name: 'a summary that no English page uses is reported',
    edit: ['src/data/ja-summaries.json', (old) => { const d = JSON.parse(old); d.push({ ...d[0], url: 'https://www.med.nagoya-u.ac.jp/medical_J/zz-unused/' }); return JSON.stringify(d, null, 2); }], expect: 'fail',
    message: /ja-summaries\.json: no English page links to https:\/\/www\.med\.nagoya-u\.ac\.jp\/medical_J\/zz-unused\//,
  },
  {
    name: 'a summary not marked as written automatically is reported',
    edit: ['src/data/ja-summaries.json', (old) => { const d = JSON.parse(old); d[0].method = 'human'; return JSON.stringify(d, null, 2); }], expect: 'fail',
    message: /ja-summaries\.json \S+: "method" must be "machine"/,
  },
  {
    name: 'a summary longer than 70 words or with a future date is reported',
    edit: ['src/data/ja-summaries.json', (old) => { const d = JSON.parse(old); d[0].en = 'word '.repeat(71); d[1].checked = '2999-01-01'; return JSON.stringify(d, null, 2); }], expect: 'fail',
    message: /summary longer than 70 words/,
    also: (r) => (/"checked" must be the date it was written/.test(r.stderr) ? null : 'the future date was not reported'),
  },
  // Dated facts: every programme and page says when it was last compared with its sources.
  {
    name: 'a programme without a checked date is reported',
    edit: ['src/data/programmes/jdp-lund.json', (old) => { const d = JSON.parse(old); delete d.checked; return JSON.stringify(d, null, 2); }], expect: 'fail',
    message: /programmes\/jdp-lund\.json: "checked" must be the date/,
  },
  {
    name: 'an impossible checked date is reported, without a crash',
    edit: ['src/data/programmes/jdp-lund.json', (old) => { const d = JSON.parse(old); d.checked = '2026-00-10'; return JSON.stringify(d, null, 2); }], expect: 'fail',
    message: /programmes\/jdp-lund\.json: "checked" must be the date/, also: (r) => (crashed(r) ? 'the check crashed' : null),
  },
  {
    name: 'a checked date more than a year old is a warning, not an error',
    edit: ['src/data/programmes/jdp-lund.json', (old) => { const d = JSON.parse(old); d.checked = '2024-01-10'; return JSON.stringify(d, null, 2); }], expect: 'pass',
    also: (r) => (/warning: programmes\/jdp-lund\.json: facts last checked on 2024-01-10, more than a year ago/.test(r.stdout) ? null : 'no warning'),
  },
  {
    name: 'a page with a future updated date is reported',
    edit: ['src/content/pages/en/about/contact.md', (old) => old.replace(/^updated: .*$/m, 'updated: 2999-01-01')], expect: 'fail',
    message: /en\/about\/contact\.md: "updated" must be a date/,
  },
];

let failed = 0;
const say = (ok, name, why = '') => { process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}${why ? ` (${why})` : ''}\n`); if (!ok) failed += 1; };

const baseline = runCheck();
if (baseline.status !== 0) {
  process.stderr.write(`FAIL baseline: the check must pass on the clean tree\n${baseline.stderr}\n`);
  process.exit(1);
}

for (const c of cases) {
  let undo = () => {};
  if (c.plant) {
    const path = join(ROOT, c.plant[0]);
    if (existsSync(path)) {
      say(false, c.name, `${c.plant[0]} already exists; remove it and run the tests again`);
      continue;
    }
    // Remember the highest folder this case creates, so the undo removes only what the test made
    // and never a folder (or its files) that was already there.
    let created = null;
    for (let d = dirname(path); d.length > ROOT.length && !existsSync(d); d = dirname(d)) created = d;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, c.plant[1]);
    undo = () => {
      rmSync(path, { force: true });
      if (created) rmSync(created, { recursive: true, force: true });
    };
  } else if (c.edit) {
    const path = join(ROOT, c.edit[0]);
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, c.edit[1](original));
    undo = () => writeFileSync(path, original);
  }
  try {
    const r = runCheck();
    const statusOk = c.expect === 'pass' ? r.status === 0 : r.status === 1;
    const messageOk = !c.message || c.message.test(r.stderr);
    const extra = c.also ? c.also(r) : null;
    say(statusOk && messageOk && !extra, c.name, !statusOk ? `exit ${r.status}` : !messageOk ? 'expected message missing' : extra ?? '');
  } finally {
    undo();
  }
}

// Files the operating system writes (which the check ignores), and files an interrupted test run may leave
// behind, are kept out of git, so they are never committed and deployed (recorded review items of #2).
{
  const paths = ['public/img/x/Thumbs.db', 'public/img/x/desktop.ini', 'public/img/x/.DS_Store', 'public/img/x/._photo.webp',
    ...cases.filter((c) => c.plant && c.plant[0].includes('zz-test')).map((c) => c.plant[0])];
  const tracked = paths.filter((p) => spawnSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: ROOT }).status !== 0);
  say(tracked.length === 0, 'operating-system files and files left by an interrupted test run are kept out of git', tracked.join(', '));
}

// The scripts must run from a folder whose path has a space and non-ASCII characters (round 2).
{
  const base = mkdtempSync(join(tmpdir(), 'check test ü 名古屋 '));
  try {
    // Everything the checks read, including the files the feature map names (src/, .github/, faculty/, content-sync.json).
    for (const part of ['scripts', 'docs', 'public', 'src', '.github', 'faculty', 'tests', 'content-sync.json', 'CONTENT_GUIDE.md', 'astro.config.mjs']) {
      cpSync(join(ROOT, part), join(base, part), { recursive: true });
    }
    const r = runCheck(base);
    say(r.status === 0, 'the check runs from a path with a space and non-ASCII characters', r.status === 0 ? '' : r.stderr.split('\n')[0]);
    const st = spawnSync(process.execPath, [join(base, 'scripts', 'check-staleness.mjs')], { cwd: base, encoding: 'utf8' });
    say(st.status === 0, 'the staleness check runs from a path with a space and non-ASCII characters', st.status === 0 ? '' : st.stderr.split('\n')[0]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const total = cases.length + 3;
process.stdout.write(`${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
