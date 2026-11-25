#!/usr/bin/env node
/**
 * The weekly check (.github/workflows/weekly-check.yml), after `astro build`:
 *   1. the content checks (scripts/check-content.mjs): passed deadlines, pairs, data;
 *   2. every outside link in the built site, with the audit's rules (scripts/external-lib.mjs).
 * Writes weekly-check.md and weekly-check.json in the folder given (default: the current one), adds the report to
 * the run summary, and sets `problems=true|false` for the step that opens or closes the issue.
 *   node --max-http-header-size=65536 scripts/weekly-check.mjs [out-dir]   (npm run weekly-check)
 * The larger header limit lets sites that send long headers (ets.org) answer instead of failing.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { externalLinks, checkAll, weeklyReport } from './external-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const OUT = process.argv[2] ?? '.';

if (!existsSync(join(DIST, 'en', 'index.html'))) {
  process.stderr.write('dist/ not found: run `astro build` first\n');
  process.exit(2);
}
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// The site's own address, from the English home page's canonical link: links under it are not outside links.
const home = readFileSync(join(DIST, 'en', 'index.html'), 'utf8');
const canonical = home.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
if (!canonical) {
  process.stderr.write('dist/en/index.html has no canonical link\n');
  process.exit(2);
}
const self = canonical.replace(/en\/$/, '');

/** @type {Map<string, Set<string>>} address -> pages that use it */
const uses = new Map();
for (const f of walk(DIST).filter((p) => p.endsWith('.html'))) {
  const page = `/${relative(DIST, f).split(sep).join('/').replace(/index\.html$/, '')}`;
  for (const url of externalLinks(readFileSync(f, 'utf8'), self)) {
    if (!uses.has(url)) uses.set(url, new Set());
    uses.get(url).add(page);
  }
}
process.stdout.write(`Checking ${uses.size} outside addresses...\n`);
const checked = await checkAll([...uses.keys()]);
const results = checked.map((r) => ({ ...r, places: [...uses.get(r.url)].sort() }));

const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-content.mjs')], { cwd: ROOT, encoding: 'utf8' });
const content = { code: run.status ?? 1, output: `${run.stdout}\n${run.stderr}` };

const date = new Date().toISOString().slice(0, 10);
const { markdown, problems } = weeklyReport({ checked: date, results, content });
writeFileSync(join(OUT, 'weekly-check.md'), markdown);
writeFileSync(join(OUT, 'weekly-check.json'), JSON.stringify({ checked: date, content, results }, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `problems=${problems}\n`);
process.stdout.write(`${markdown}\nProblems that need a person: ${problems ? 'yes' : 'no'}\n`);
