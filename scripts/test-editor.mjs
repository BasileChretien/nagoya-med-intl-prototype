#!/usr/bin/env node
/**
 * Tests for the editing page's link to the "both languages in step" rule (scripts/editor-lib.mjs and
 * scripts/editor-confirm.mjs): which registry keys a changed file owns, what an editor save confirms, and which
 * commits count as editor saves. The last cases change the tree, confirm, run the staleness check and restore.
 * Run: node scripts/test-editor.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { EDITOR_MARKER, isEditorCommit, ownerOf, planConfirmation, applyPlan, editorRange } from './editor-lib.mjs';
import { confirmChanged } from './editor-confirm.mjs';
import { pagePairs, dataFiles } from './staleness-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SYNC = 'content-sync.json';
let failed = 0;
let total = 0;
const say = (ok, name, why = '') => { total += 1; process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}${why && !ok ? ` (${why})` : ''}\n`); if (!ok) failed += 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------ which keys a changed file owns
{
  const cases = [
    ['src/content/pages/ja/study-in-nagoya/faq.md', { kind: 'page', slug: 'study-in-nagoya/faq' }],
    ['src/content/pages/en/about/index.md', { kind: 'page', slug: 'about' }],
    ['src\\content\\pages\\ja\\degrees\\lund.md', { kind: 'page', slug: 'degrees/lund' }],
    ['src/data/programmes/sep-unc.json', { kind: 'data', file: 'programmes/sep-unc.json' }],
    ['src/data/news.json', { kind: 'data', file: 'news.json' }],
    ['src/data/contacts.json', { kind: 'data', file: 'contacts.json' }],
    ['src/data/reports/original/degree-30.json', null],
    ['public/admin/config.yml', null],
    ['content-sync.json', null],
    ['src/content/pages/fr/about/index.md', null],
  ];
  for (const [path, want] of cases) say(same(ownerOf(path), want), `${path} owns ${want ? JSON.stringify(want) : 'nothing'}`, JSON.stringify(ownerOf(path)));
}

// The mapping names pages and data files exactly as the staleness check does, for every file in the tree.
{
  const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
  const pages = pagePairs(ROOT);
  const files = walk(join(ROOT, 'src', 'content', 'pages')).filter((f) => f.endsWith('.md')).map((f) => relative(ROOT, f).split(sep).join('/'));
  const missing = files.map(ownerOf).filter((o) => o?.kind !== 'page' || !pages[o.slug]).length;
  say(missing === 0 && files.length > 0, 'every page file maps to a page key the staleness check uses', `${missing} of ${files.length} do not`);
  const names = dataFiles(ROOT).map((d) => d.file);
  const wrong = names.filter((n) => ownerOf(`src/data/${n}`)?.file !== n);
  say(wrong.length === 0, 'every bilingual data file maps to its own field-key prefix', wrong.join(', '));
}

// ------------------------------------------------------------ what a save confirms
{
  const pages = { 'study-in-nagoya/faq': { en: 'e1', ja: 'j2' }, 'degrees/lund': { en: 'e9', ja: 'j8' }, about: { en: 'a', ja: 'b' } };
  const fields = {
    'news.json#2026-01-a/title': { en: 'x', ja: 'y2' },
    'news.json#news-new/title': { en: 'n', ja: 'm' },
    'programmes/sep-unc.json#deadline/text': { en: 'd', ja: 'e2' },
    'programmes/sep-unc.json#capacity': { en: 'c', ja: 'c' },
    'programmes/jdp-lund.json#cost': { en: 'k2', ja: 'l' },
  };
  const registry = {
    pages: { 'study-in-nagoya/faq': { en: 'e1', ja: 'j1' }, 'degrees/lund': { en: 'e1', ja: 'j1' }, about: { en: 'a', ja: 'b' } },
    fields: {
      'news.json#2026-01-a/title': { en: 'x', ja: 'y' },
      'news.json#gone/title': { en: 'g', ja: 'h' },
      'programmes/sep-unc.json#deadline/text': { en: 'd', ja: 'e' },
      'programmes/sep-unc.json#capacity': { en: 'c', ja: 'c' },
      'programmes/jdp-lund.json#cost': { en: 'k', ja: 'l' },
    },
  };
  const frozen = JSON.stringify(registry);
  const plan = planConfirmation({
    changed: ['src/content/pages/ja/study-in-nagoya/faq.md', 'src/content/pages/en/about/index.md', 'src/data/news.json', 'src/data/programmes/sep-unc.json', 'public/admin/config.yml'],
    pages, fields, registry,
  });
  say(same(plan.pages, ['study-in-nagoya/faq']), 'a changed page is confirmed; an unchanged one (about) and one in a file not saved (degrees/lund) are not', JSON.stringify(plan.pages));
  say(same(plan.fields, ['news.json#2026-01-a/title', 'news.json#news-new/title', 'programmes/sep-unc.json#deadline/text']),
    'changed and new fields of the saved files are confirmed; fields of other files (jdp-lund) are not', JSON.stringify(plan.fields));
  say(same(plan.dropped, ['news.json#gone/title']), 'the entries of an item removed from a saved file are forgotten', JSON.stringify(plan.dropped));
  const next = applyPlan(registry, plan, pages, fields);
  say(JSON.stringify(registry) === frozen, 'applying the plan leaves the given registry unchanged');
  say(same(next.pages['study-in-nagoya/faq'], { en: 'e1', ja: 'j2' }) && same(next.fields['news.json#news-new/title'], { en: 'n', ja: 'm' }) && !next.fields['news.json#gone/title']
    && same(next.fields['programmes/jdp-lund.json#cost'], { en: 'k', ja: 'l' }), 'the new registry records the saved state and keeps the rest');
  const none = planConfirmation({ changed: ['README.md', 'src/data/programmes'], pages, fields, registry });
  say(!none.pages.length && !none.fields.length && !none.dropped.length, 'a commit that changes no page or data file confirms nothing');
}

// ------------------------------------------------------------ which commits are editor saves
{
  say(isEditorCommit('[editor] 更新：プログラム「sep-unc」（Office）') && !isEditorCommit('feat: [editor] in the middle') && !isEditorCommit('chore: record editor saves [skip ci]') && !isEditorCommit(undefined),
    'only a message that starts with the marker is an editor save');
  const c = (sha, message, hasParent = true) => ({ sha, message, hasParent });
  say(same(editorRange([c('a', '[editor] x'), c('b', '[editor] y'), c('c', 'feat: z'), c('d', '[editor] w')]), ['a', 'b']), 'the walk takes the editor saves on top and stops at the first other commit');
  say(same(editorRange([c('a', 'feat: z'), c('b', '[editor] y')]), []), 'a developer commit on top confirms nothing, even over editor saves');
  say(same(editorRange([c('a', '[editor] x'), c('b', 'chore: record both languages after an editor save [skip ci]'), c('c', '[editor] y')]), ['a']), 'the walk stops at the previous run\'s record commit');
  say(same(editorRange([c('a', '[editor] x'), c('b', '[editor] y', false)]), ['a']), 'a commit whose parent is not in a shallow clone is not taken (it would look as if it added every file)');
}

// ------------------------------------------------------------ config.yml keeps the marker first
{
  const config = parse(readFileSync(join(ROOT, 'public', 'admin', 'config.yml'), 'utf8'));
  const messages = Object.entries(config.backend?.commit_messages ?? {});
  say(messages.length >= 3 && messages.every(([, m]) => String(m).startsWith(EDITOR_MARKER)), `every commit message in config.yml starts with ${EDITOR_MARKER}`, JSON.stringify(messages));
}

// ------------------------------------------------------------ on the real tree, with the staleness check
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const staleness = () => spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-staleness.mjs')], { cwd: ROOT, encoding: 'utf8' });
function withChanges(changes, fn) {
  const saved = new Map([[SYNC, read(SYNC)]]);
  try {
    for (const [p, change] of changes) { if (!saved.has(p)) saved.set(p, read(p)); writeFileSync(join(ROOT, p), change(read(p))); }
    return fn();
  } finally {
    for (const [p, content] of saved) writeFileSync(join(ROOT, p), content);
  }
}
const JA_FAQ = 'src/content/pages/ja/study-in-nagoya/faq.md';
const EN_LUND = 'src/content/pages/en/degrees/lund.md';
const NEWS = 'src/data/news.json';
const append = (text) => (old) => `${old.trimEnd()}\n\n${text}\n`;

say(staleness().status === 0, 'baseline: the staleness check passes on the clean tree');

withChanges([[JA_FAQ, append('誤字を直しました。')]], () => {
  const plan = confirmChanged(ROOT, [JA_FAQ]);
  const r = staleness();
  say(same(plan.pages, ['study-in-nagoya/faq']) && r.status === 0, 'a page changed in one language by the editor passes once confirmed', r.stderr.slice(0, 300));
});

withChanges([[JA_FAQ, append('誤字を直しました。')], [EN_LUND, append('A developer change.')]], () => {
  confirmChanged(ROOT, [JA_FAQ]);
  const r = staleness();
  say(r.status === 1 && /degrees\/lund is stale/.test(r.stderr) && !/study-in-nagoya\/faq/.test(r.stderr),
    'a change outside the editor\'s commit stays out of step', r.stderr.slice(0, 300));
});

withChanges([[NEWS, (old) => {
  const d = JSON.parse(old);
  d.push({ id: 'news-zztest', date: '2026-11-01', category: 'news', title: { en: 'Test item', ja: 'テストの項目' }, summary: { en: 'A test.', ja: 'テストです。' } });
  d.splice(0, 1);
  return `${JSON.stringify(d, null, 2)}\n`;
}]], () => {
  const plan = confirmChanged(ROOT, [NEWS]);
  const r = staleness();
  say(plan.fields.includes('news.json#news-zztest/title') && plan.dropped.length > 0 && r.status === 0,
    'a news item added and one removed in the editor pass once confirmed', r.stderr.slice(0, 300));
});

withChanges([['src/data/programmes/sep-unc.json', (old) => { const d = JSON.parse(old); d.capacity.ja = '各大学から年3名'; return `${JSON.stringify(d, null, 2)}\n`; }]], () => {
  confirmChanged(ROOT, ['src/data/programmes/sep-unc.json']);
  const r = staleness();
  say(r.status === 1 && /programmes\/sep-unc\.json#capacity: numbers differ/.test(r.stderr),
    'a fact whose two languages give different numbers still fails after an editor save', r.stderr.slice(0, 300));
});

process.stdout.write(`${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
