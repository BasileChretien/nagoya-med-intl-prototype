#!/usr/bin/env node
/**
 * Fetch the live faculty pages and compare them with the international site (see faculty-live-lib.mjs).
 * Run weekly by .github/workflows/faculty-drift.yml, or by hand: npm run check:faculty
 * Exits 1 when an active rule fails or a known gap no longer happens; pending rules and known gaps
 * (faculty.json knownGaps) are listed without failing.
 */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadFacultyConfig, analyseFacultyPage, evaluateFaculty } from './faculty-live-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const cfg = loadFacultyConfig(ROOT);
const kinds = [...new Set(Object.values(cfg.liveChecks).flatMap((r) => r.pages))];

const results = [];
const unreachable = [];
for (const kind of kinds) {
  for (const lang of ['en', 'ja']) {
    const url = cfg.pages[kind][lang];
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; faculty-drift-check)' } });
      if (!res.ok) { unreachable.push(`${kind} (${lang}): ${url} answered ${res.status}`); continue; }
      results.push(analyseFacultyPage(await res.text(), { kind, lang }, cfg));
    } catch (e) {
      unreachable.push(`${kind} (${lang}): ${url} could not be fetched (${e.message})`);
    }
  }
}
const { failures, pending, known, passed } = evaluateFaculty(results, cfg);
failures.push(...unreachable);

const lines = [
  '## Faculty pages compared with the international site',
  '',
  ...(failures.length ? ['### Out of step', '', ...failures.map((f) => `- ${f}`), ''] : ['No active rule fails.', '']),
  ...(known.length ? ['### Known gaps (not fixed by the faculty yet; see knownGaps in src/data/faculty.json)', '', ...known.map((k) => `- ${k}`), ''] : []),
  ...(pending.length ? ['### Waiting for the faculty\'s web team', '', ...pending.map((p) => `- ${p}`), ''] : []),
  '### In step', '', ...passed.map((p) => `- ${p}`), '',
];
process.stdout.write(`${lines.join('\n')}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
// exitCode, not process.exit(): exiting while fetch connections close crashes Node on Windows.
process.exitCode = failures.length ? 1 : 0;
