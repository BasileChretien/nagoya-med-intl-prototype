#!/usr/bin/env node
/**
 * Record saves from the editing page as in step in both languages, so the checks let them through
 * (scripts/editor-lib.mjs explains the rule). Run by .github/workflows/deploy.yml on every run on main, before the
 * checks, and again by its record-editor-sync job, which commits the result.
 *
 *   node scripts/editor-confirm.mjs                  record pending editor saves in content-sync.json, regenerate
 *                                                    faculty/ when there were any, print what was done
 *   node scripts/editor-confirm.mjs --dry-run        print what would be recorded, write nothing
 *   node scripts/editor-confirm.mjs --record-message print the message of the record commit
 *
 * Does nothing when no editor save is pending (none since the last record commit).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagePairs, dataFields, readRegistry, writeRegistry, SYNC_FILE } from './staleness-lib.mjs';
import { pendingEditorCommits, planRecord, applyPlan, isRecordCommit, RECORD_MESSAGE, RECORD_SUBJECT } from './editor-lib.mjs';

/**
 * How many commits to look at, at most. deploy.yml fetches LOOK_BACK + 1 commits (fetch-depth 51), so the oldest of
 * them still has its parent to compare with. Pending saves beyond this are missed (the check then reports them).
 */
export const LOOK_BACK = 50;

/** @param {string} root @param {string[]} args */
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

/** The newest record commit reachable from HEAD (by its subject, not by text quoted in a message body), or null. */
export function lastRecordCommit(root, n = LOOK_BACK) {
  const log = git(root, ['log', `-n${n}`, '--fixed-strings', `--grep=${RECORD_SUBJECT}`, '--format=%H%x1f%B%x1e']);
  if (!log.ok) throw new Error('git log failed: run this in a git clone');
  const hit = log.out.split('\x1e').map((s) => s.trim()).filter(Boolean).map((e) => e.split('\x1f')).find(([, message]) => isRecordCommit(message));
  return hit ? hit[0] : null;
}

/**
 * The commits reachable from HEAD but not from the last record commit, newest first, along every parent: a merge
 * from a plain `git pull` can put an editor save on its second parent. With a record commit, every such commit in the
 * clone is listed (the record commit and the clone's depth bound the list; a count would let a long merged branch,
 * listed first by --topo-order, push older first-parent saves out). Without one, the LOOK_BACK newest are listed.
 */
export function recentCommits(root, n = LOOK_BACK) {
  const record = lastRecordCommit(root, n);
  const range = record ? ['HEAD', `^${record}`] : [`-n${n}`, 'HEAD'];
  const log = git(root, ['log', '--topo-order', '--format=%H%x1f%P%x1f%B%x1e', ...range]);
  if (!log.ok) throw new Error('git log failed: run this in a git clone');
  return log.out.split('\x1e').map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [sha, parents = '', message = ''] = entry.split('\x1f');
    return {
      sha,
      message,
      merge: parents.trim().split(/\s+/).filter(Boolean).length > 1,
      hasParent: git(root, ['rev-parse', '--verify', '--quiet', `${sha}^1`]).ok,
    };
  });
}

/** Files a commit changed, compared with its first parent. */
export function changedFiles(root, sha) {
  const diff = git(root, ['diff', '--name-only', '--no-renames', `${sha}^1`, sha]);
  if (!diff.ok) throw new Error(`git diff failed for ${sha}`);
  return diff.out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** A file's content at a revision, or null when it is not there. */
export const readAt = (root) => (rev, path) => {
  const r = git(root, ['show', `${rev}:${path}`]);
  return r.ok ? r.out : null;
};

/** The registry as committed at a revision (empty when the file is not there). */
export const registryAt = (root) => (rev) => {
  const text = readAt(root)(rev, SYNC_FILE);
  if (text === null) return { pages: {}, fields: {} };
  const r = JSON.parse(text);
  return { pages: r.pages ?? {}, fields: r.fields ?? {} };
};

/**
 * Record the pending editor saves of the clone at root. Writes content-sync.json unless dryRun.
 * @returns {{ shas: string[], plan: ReturnType<typeof planRecord> }}
 */
export function recordPending(root, { dryRun = false } = {}) {
  const shas = pendingEditorCommits(recentCommits(root));
  const registryNow = readRegistry(root);
  if (!registryNow) throw new Error(`${SYNC_FILE} is missing`);
  const commits = [...shas].reverse().map((sha) => ({ sha, changed: changedFiles(root, sha) }));
  const plan = planRecord({
    commits,
    readAt: readAt(root),
    registryAt: registryAt(root),
    registryNow,
    existsNow: { pages: pagePairs(root), fields: dataFields(root) },
  });
  if (!dryRun && shas.length) writeRegistry(root, applyPlan(registryNow, plan));
  return { shas, plan };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--record-message')) { process.stdout.write(`${RECORD_MESSAGE}\n`); process.exit(0); }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dryRun = process.argv.includes('--dry-run');
  const { shas, plan } = recordPending(root, { dryRun });
  // In GitHub Actions, tell later jobs how many saves were pending (deploy.yml runs record-editor-sync only then).
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pending=${shas.length}\n`);
  if (!shas.length) {
    process.stdout.write('No editor save is waiting to be recorded.\n');
    process.exit(0);
  }
  process.stdout.write(`Editor saves to record: ${shas.map((s) => s.slice(0, 7)).join(', ')}\n`);
  const verb = dryRun ? 'would record' : 'recorded';
  for (const k of [...Object.keys(plan.pages), ...Object.keys(plan.fields)]) process.stdout.write(`${verb} ${k}\n`);
  for (const k of plan.dropped) process.stdout.write(`${dryRun ? 'would forget' : 'forgot'} ${k} (no longer exists)\n`);
  if (!dryRun) {
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'build-faculty-texts.mjs')], { cwd: root, encoding: 'utf8' });
    process.stdout.write(r.stdout);
    if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(1); }
  }
}
