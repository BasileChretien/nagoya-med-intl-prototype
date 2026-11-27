#!/usr/bin/env node
/**
 * After a save in the editing page: record as in step the pages and fields that the editor's commits changed, and
 * regenerate the faculty texts, so the checks let the save through. Run by .github/workflows/deploy.yml before the
 * checks, only when the pushed commit's message starts with "[editor]" (scripts/editor-lib.mjs explains the rule).
 *
 *   node scripts/editor-confirm.mjs           confirm, write content-sync.json and faculty/, print what was done
 *   node scripts/editor-confirm.mjs --dry-run print what would be confirmed, write nothing
 *
 * Does nothing (exit 0) when the last commit is not an editor save.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagePairs, dataFields, readRegistry, writeRegistry, SYNC_FILE } from './staleness-lib.mjs';
import { planConfirmation, applyPlan, editorRange } from './editor-lib.mjs';

/** How many commits to look back at most; deploy.yml fetches this many. */
export const LOOK_BACK = 30;

/** @param {string} root @param {string[]} args */
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

/** The editor commits from HEAD down (see editorRange) and the files they changed. */
export function editorChanges(root) {
  const log = git(root, ['log', `-n${LOOK_BACK}`, '--format=%H%x1f%B%x1e']);
  if (!log.ok) throw new Error('git log failed: run this in a git clone');
  const commits = log.out.split('\x1e').map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [sha, message = ''] = entry.split('\x1f');
    return { sha, message, hasParent: git(root, ['rev-parse', '--verify', '--quiet', `${sha}^`]).ok };
  });
  const shas = editorRange(commits);
  const changed = new Set();
  for (const sha of shas) {
    const diff = git(root, ['diff', '--name-only', '--no-renames', `${sha}^`, sha]);
    if (!diff.ok) throw new Error(`git diff failed for ${sha}`);
    for (const f of diff.out.split('\n').map((s) => s.trim()).filter(Boolean)) changed.add(f);
  }
  return { shas, changed: [...changed].sort() };
}

/** Confirm what the changed files hold; returns the plan. Writes content-sync.json unless dryRun. */
export function confirmChanged(root, changed, { dryRun = false } = {}) {
  const registry = readRegistry(root);
  if (!registry) throw new Error(`${SYNC_FILE} is missing`);
  const pages = pagePairs(root);
  const fields = dataFields(root);
  const plan = planConfirmation({ changed, pages, fields, registry });
  if (!dryRun) writeRegistry(root, applyPlan(registry, plan, pages, fields));
  return plan;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dryRun = process.argv.includes('--dry-run');
  const { shas, changed } = editorChanges(root);
  if (!shas.length) {
    process.stdout.write('The last commit is not an editor save: nothing confirmed (developer commits are confirmed by hand).\n');
    process.exit(0);
  }
  process.stdout.write(`Editor saves: ${shas.map((s) => s.slice(0, 7)).join(', ')}\nFiles changed: ${changed.join(', ') || 'none'}\n`);
  const plan = confirmChanged(root, changed, { dryRun });
  for (const k of [...plan.pages, ...plan.fields]) process.stdout.write(`${dryRun ? 'would confirm' : 'confirmed'} ${k}\n`);
  for (const k of plan.dropped) process.stdout.write(`${dryRun ? 'would forget' : 'forgot'} ${k} (no longer exists)\n`);
  if (!dryRun) {
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'build-faculty-texts.mjs')], { cwd: root, encoding: 'utf8' });
    process.stdout.write(r.stdout);
    if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(1); }
  }
}
