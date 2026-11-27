#!/usr/bin/env node
/**
 * Tests for the editing page's link to the "both languages in step" rule (scripts/editor-lib.mjs and
 * scripts/editor-confirm.mjs): which registry keys a changed file owns, which commits are pending editor saves, and
 * what recording them changes. The recording cases run on small git repositories made in the system's temporary
 * folder, so they exercise the same git commands as the deploy workflow. Run: node scripts/test-editor.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { EDITOR_MARKER, RECORD_MESSAGE, isEditorCommit, isRecordCommit, ownerOf, pendingEditorCommits, applyPlan } from './editor-lib.mjs';
import { recordPending } from './editor-confirm.mjs';
import { pagePairs, dataFiles, dataFields, readRegistry, writeRegistry, comparePages, compareFields } from './staleness-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let failed = 0;
let total = 0;
const say = (ok, name, why = '') => { total += 1; process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}${why && !ok ? ` (${why})` : ''}\n`); if (!ok) failed += 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------ which keys a changed file owns
{
  const cases = [
    ['src/content/pages/ja/study-in-nagoya/faq.md', { kind: 'page', slug: 'study-in-nagoya/faq', rel: 'study-in-nagoya/faq.md' }],
    ['src/content/pages/en/about/index.md', { kind: 'page', slug: 'about', rel: 'about/index.md' }],
    ['src\\content\\pages\\ja\\degrees\\lund.md', { kind: 'page', slug: 'degrees/lund', rel: 'degrees/lund.md' }],
    ['src/data/programmes/sep-unc.json', { kind: 'data', file: 'programmes/sep-unc.json', facts: true }],
    ['src/data/news.json', { kind: 'data', file: 'news.json', facts: false }],
    ['src/data/contacts.json', { kind: 'data', file: 'contacts.json', facts: true }],
    ['src/data/stories.json', null],
    ['src/data/reports/original/degree-30.json', null],
    ['public/admin/config.yml', null],
    ['content-sync.json', null],
    ['src/content/pages/fr/about/index.md', null],
  ];
  for (const [path, want] of cases) say(same(ownerOf(path), want), `${path} owns ${want ? `${want.kind} ${want.slug ?? want.file}` : 'nothing'}`, JSON.stringify(ownerOf(path)));
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

// ------------------------------------------------------------ which commits are pending editor saves
{
  say(isEditorCommit('[editor] 更新：プログラム「sep-unc」（Office）') && !isEditorCommit('feat: [editor] in the middle') && !isEditorCommit(RECORD_MESSAGE) && !isEditorCommit(undefined),
    'only a message that starts with the marker is an editor save');
  say(isRecordCommit(RECORD_MESSAGE) && RECORD_MESSAGE.includes('[skip ci]') && !isRecordCommit('chore: confirm both languages: x'), 'the record commit has a fixed message with [skip ci]');
  const c = (sha, message, hasParent = true) => ({ sha, message, hasParent });
  say(same(pendingEditorCommits([c('a', '[editor] x'), c('b', 'feat: z'), c('c', '[editor] y'), c('d', RECORD_MESSAGE), c('e', '[editor] w')]), ['a', 'c']),
    'developer commits are skipped and the walk stops at the last record commit');
  say(same(pendingEditorCommits([c('a', 'feat: z'), c('b', '[editor] y'), c('c', '[editor] x')]), ['b', 'c']), 'editor saves under a developer commit are still pending');
  say(same(pendingEditorCommits([c('a', RECORD_MESSAGE), c('b', '[editor] y')]), []), 'nothing is pending right after a record commit');
  say(same(pendingEditorCommits([c('a', '[editor] x'), c('b', '[editor] y', false), c('d', '[editor] w')]), ['a', 'd']),
    'a commit whose parent is not in a shallow clone is skipped (it would look as if it added every file), not the ones after it');
  const frozen = { pages: { p: { en: '1', ja: '1' } }, fields: { f: { en: '1', ja: '1' }, g: { en: '1', ja: '1' } } };
  const before = JSON.stringify(frozen);
  const next = applyPlan(frozen, { pages: { p: { en: '1', ja: '2' } }, fields: {}, dropped: ['g'] });
  say(JSON.stringify(frozen) === before && next.pages.p.ja === '2' && !next.fields.g && next.fields.f, 'applying a plan returns a new registry and leaves the given one unchanged');
}

// ------------------------------------------------------------ the deploy workflow and config.yml use the same constants
{
  const config = parse(readFileSync(join(ROOT, 'public', 'admin', 'config.yml'), 'utf8'));
  const messages = Object.entries(config.backend?.commit_messages ?? {});
  say(messages.length >= 3 && messages.every(([, m]) => String(m).startsWith(EDITOR_MARKER)), `every commit message in config.yml starts with ${EDITOR_MARKER}`, JSON.stringify(messages));
  const deploy = readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
  say(deploy.includes('editor-confirm.mjs --record-message') && /cancel-in-progress: false/.test(deploy) && /fetch-depth: 51/.test(deploy) && /--depth=51/.test(deploy)
    && /needs\.build\.outputs\.editor_pending/.test(deploy),
    'deploy.yml takes the record message from the script, fetches LOOK_BACK + 1 commits, does not cancel a running record job and starts it only when saves are pending');
}

// ------------------------------------------------------------ recording, on small git repositories
const strip = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { en: v.en, ja: v.ja }]));
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'zz-editor-test-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const write = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  const commit = (message) => { git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', message); };
  const news = (items) => `${JSON.stringify(items, null, 2)}\n`;
  const confirmAll = () => writeRegistry(dir, { pages: pagePairs(dir), fields: strip(dataFields(dir)) });
  git('init', '-q');
  for (const [k, v] of [['user.email', 'test@example.invalid'], ['user.name', 'Test'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false']]) git('config', k, v);
  write('src/content/pages/en/about/index.md', '---\ntitle: About\nupdated: 2026-11-25\n---\n\nWe are the office.\n');
  write('src/content/pages/ja/about/index.md', '---\ntitle: 私たちについて\nupdated: 2026-11-25\n---\n\n国際連携室です。\n');
  write('src/data/news.json', news([
    { id: 'a', date: '2026-01-01', title: { en: 'First', ja: '一つ目' } },
    { id: 'b', date: '2026-02-01', title: { en: 'Second', ja: '二つ目' } },
  ]));
  write('README.md', 'test\n');
  confirmAll();
  commit('chore: start');
  const readNews = () => JSON.parse(readFileSync(join(dir, 'src/data/news.json'), 'utf8'));
  const editNews = (fn) => { const d = readNews(); fn(d); write('src/data/news.json', news(d)); };
  const editJa = (text) => write('src/content/pages/ja/about/index.md', `---\ntitle: 私たちについて\nupdated: 2026-11-25\n---\n\n${text}\n`);
  const stale = () => {
    const reg = readRegistry(dir);
    return [...comparePages(pagePairs(dir), reg.pages), ...compareFields(dataFields(dir), reg.fields)];
  };
  return { dir, git, write, commit, editNews, editJa, confirmAll, stale, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
function inRepo(name, fn) {
  let repo;
  try { repo = makeRepo(); const why = fn(repo); say(!why, name, why ?? ''); } catch (e) { say(false, name, e.message); } finally { repo?.remove(); }
}

inRepo('a page saved in one language by the editor is recorded, and the check passes', (r) => {
  r.editJa('国際連携室の窓口です。');
  r.commit('[editor] 更新：ページ「index」（Office）');
  const { plan } = recordPending(r.dir);
  return same(Object.keys(plan.pages), ['about']) && !r.stale().length ? null : `${JSON.stringify(plan)} ${r.stale()}`;
});

inRepo('an editor save under a developer commit is still recorded (developer commit after an editor save)', (r) => {
  r.editJa('国際連携室の窓口です。');
  r.commit('[editor] 更新：ページ「index」（Office）');
  r.write('README.md', 'changed by a developer\n');
  r.commit('docs: a developer change');
  const { shas, plan } = recordPending(r.dir);
  return shas.length === 1 && plan.pages.about && !r.stale().length ? null : `${JSON.stringify(plan)} ${r.stale()}`;
});

inRepo('two editor saves whose first run was cancelled are both recorded by the next run', (r) => {
  r.editJa('国際連携室の窓口です。');
  r.commit('[editor] 更新：ページ「index」（Office）');
  r.editNews((d) => { d[1].title.ja = '二つ目のお知らせ'; });
  r.commit('[editor] 更新：お知らせ「1」（Office）');
  const { shas, plan } = recordPending(r.dir);
  return shas.length === 2 && plan.pages.about && plan.fields['news.json#b/title'] && !r.stale().length ? null : `${JSON.stringify(plan)} ${r.stale()}`;
});

inRepo('a developer\'s unconfirmed change in a file the editor also saved stays out of step', (r) => {
  r.editNews((d) => { d[0].title.en = 'First, changed by a developer'; });
  r.commit('feat: a developer change, not confirmed');
  r.editNews((d) => { d[1].title.ja = '二つ目のお知らせ'; });
  r.commit('[editor] 更新：お知らせ「1」（Office）');
  const { plan } = recordPending(r.dir);
  const left = r.stale();
  return same(Object.keys(plan.fields), ['news.json#b/title']) && left.length === 1 && /news\.json#a\/title: ja is stale/.test(left[0]) ? null : `${JSON.stringify(plan)} ${left}`;
});

inRepo('the walk stops at the record commit: a later developer change stays out of step', (r) => {
  r.editJa('国際連携室の窓口です。');
  r.commit('[editor] 更新：ページ「index」（Office）');
  recordPending(r.dir);
  r.commit(RECORD_MESSAGE);
  r.write('src/content/pages/en/about/index.md', '---\ntitle: About\nupdated: 2026-11-25\n---\n\nWe are the office, changed.\n');
  r.commit('feat: a developer change, not confirmed');
  r.editNews((d) => { d[1].title.ja = '二つ目のお知らせ'; });
  r.commit('[editor] 更新：お知らせ「1」（Office）');
  const { shas, plan } = recordPending(r.dir);
  const left = r.stale();
  return shas.length === 1 && !plan.pages.about && left.length === 1 && /ja\/about is stale/.test(left[0]) ? null : `${JSON.stringify(plan)} ${left}`;
});

inRepo("documented limit: a developer's unconfirmed change to the same key is confirmed with the editor's save of it", (r) => {
  r.write('src/content/pages/en/about/index.md', '---\ntitle: About\nupdated: 2026-11-25\n---\n\nWe are the office, changed.\n');
  r.commit('feat: a developer change to the English page, not confirmed');
  r.editJa('国際連携室の窓口です。');
  r.commit('[editor] 更新：ページ「index」（Office）');
  const { plan } = recordPending(r.dir);
  return plan.pages.about && !r.stale().length ? null : `${JSON.stringify(plan)} ${r.stale()}`;
});

inRepo('an editor save on the second parent of a merge (a plain git pull) is recorded', (r) => {
  const base = r.git('rev-parse', 'HEAD');
  r.editJa('国際連携室の窓口です。');
  r.commit('[editor] 更新：ページ「index」（Office）');
  const save = r.git('rev-parse', 'HEAD');
  r.git('checkout', '-q', '-b', 'local', base);
  r.write('README.md', 'a developer change made before pulling\n');
  r.commit('docs: a developer change');
  r.git('merge', '-q', '--no-ff', '-m', 'Merge remote-tracking branch origin/main', save);
  const parents = r.git('rev-list', '--parents', '-n1', 'HEAD').split(' ');
  const { shas, plan } = recordPending(r.dir);
  return parents[2] === save && same(shas, [save]) && plan.pages.about && !r.stale().length ? null : `${parents} ${JSON.stringify({ shas, plan })} ${r.stale()}`;
});

inRepo('a commit that only quotes the record message in its body does not stop the walk', (r) => {
  r.editJa('国際連携室の窓口です。');
  r.commit('[editor] 更新：ページ「index」（Office）');
  r.commit(`docs: explain the workflow\n\nIt pushes "${RECORD_MESSAGE}".`);
  const { shas, plan } = recordPending(r.dir);
  return shas.length === 1 && plan.pages.about ? null : JSON.stringify({ shas, plan });
});

inRepo('a developer confirmation made after an editor save is not overwritten', (r) => {
  r.editNews((d) => { d[0].title.ja = '一つ目（編集）'; });
  r.commit('[editor] 更新：お知らせ「0」（Office）');
  r.editNews((d) => { d[0].title = { en: 'First, rewritten', ja: '一つ目、書き直し' }; });
  r.confirmAll();
  r.commit('feat: rewrite item a and confirm it');
  const confirmed = readRegistry(r.dir).fields['news.json#a/title'];
  const { plan } = recordPending(r.dir);
  return !plan.fields['news.json#a/title'] && same(readRegistry(r.dir).fields['news.json#a/title'], confirmed) && !r.stale().length ? null : `${JSON.stringify(plan)} ${r.stale()}`;
});

inRepo('a news item added and one removed in the editor are recorded and forgotten', (r) => {
  r.editNews((d) => { d.splice(0, 1); d.push({ id: 'news-new', date: '2026-03-01', title: { en: 'New', ja: '新しい項目' } }); });
  r.commit('[editor] 追加：お知らせ「2」（Office）');
  const { plan } = recordPending(r.dir);
  return plan.fields['news.json#news-new/title'] && same(plan.dropped, ['news.json#a/title']) && !r.stale().length ? null : `${JSON.stringify(plan)} ${r.stale()}`;
});

inRepo('a save that changes only the "updated" date records nothing', (r) => {
  r.write('src/content/pages/ja/about/index.md', '---\ntitle: 私たちについて\nupdated: 2026-11-26\n---\n\n国際連携室です。\n');
  r.commit('[editor] 更新：ページ「index」（Office）');
  const { shas, plan } = recordPending(r.dir);
  return shas.length === 1 && !Object.keys(plan.pages).length && !Object.keys(plan.fields).length && !r.stale().length ? null : JSON.stringify(plan);
});

inRepo('nothing is recorded when no editor save is pending', (r) => {
  r.write('README.md', 'changed\n');
  r.commit('docs: a developer change');
  const before = readFileSync(join(r.dir, 'content-sync.json'), 'utf8');
  const { shas } = recordPending(r.dir);
  return !shas.length && readFileSync(join(r.dir, 'content-sync.json'), 'utf8') === before ? null : 'something was written';
});

process.stdout.write(`${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
