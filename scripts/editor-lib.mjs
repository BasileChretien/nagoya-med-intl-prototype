/**
 * Saves made in the editing page (public/admin/config.yml, Sveltia CMS) and the "both languages in step" rule.
 *
 * Every editor save is a commit whose message starts with EDITOR_MARKER (backend.commit_messages in config.yml).
 * Office staff cannot run `npm run sync -- confirm`, so the deploy workflow records editor saves as in step
 * (scripts/editor-confirm.mjs): for each editor commit since the last record commit, the pages and fields whose value
 * that commit changed, with the whole value it gave them (both languages). The editor's change is trusted as checked
 * in both languages. Other keys stay as strict as before, even in a file an editor also saved, and a key whose registry
 * entry changed after the save (a developer confirmed it) is left as the developer recorded it. Two limits:
 *  - a developer's unconfirmed change to the same key (the English of a page, say) is confirmed with the editor's
 *    save of that key (its Japanese), because the key's whole value after the save is recorded;
 *  - a developer confirmation that leaves the registry entry as it was cannot be told from no confirmation.
 * Facts whose two languages give different numbers, and fields given in one language only, still fail the check.
 */
import { slugOf, pageText, fingerprint, dataFileOf, scanDataFile } from './staleness-lib.mjs';

export const EDITOR_MARKER = '[editor]';
/** The subject of the commit the workflow pushes after recording editor saves; the walk back stops at it. */
export const RECORD_SUBJECT = 'chore: record editor saves as in step';
export const RECORD_MESSAGE = `${RECORD_SUBJECT} [skip ci]`;

/** @param {unknown} message @returns {boolean} */
export const isEditorCommit = (message) => typeof message === 'string' && message.trimStart().startsWith(EDITOR_MARKER);
/** @param {unknown} message @returns {boolean} */
export const isRecordCommit = (message) => typeof message === 'string' && message.trimStart().startsWith(RECORD_SUBJECT);

/**
 * What a changed file of the repository holds in content-sync.json: a page (its slug as pagePairs names it, and its
 * path under the language folder) or a data file compared between languages (as dataFiles names it, the prefix of its
 * field keys before "#"). Other files hold nothing.
 * @param {string} path repository path, "/" or "\" separators
 * @returns {{ kind: 'page', slug: string, rel: string } | { kind: 'data', file: string, facts: boolean } | null}
 */
export function ownerOf(path) {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const page = p.match(/^src\/content\/pages\/(?:en|ja)\/(.+\.md)$/);
  if (page) return { kind: 'page', slug: slugOf(page[1]), rel: page[1] };
  const data = p.match(/^src\/data\/(.+\.json)$/);
  const known = data ? dataFileOf(data[1]) : null;
  return known ? { kind: 'data', ...known } : null;
}

/**
 * The editor commits not yet recorded, newest first, from the commits since the last record commit (editor-confirm.mjs
 * lists them along every parent). Developer and merge commits are skipped, so an editor save under a developer push,
 * or one whose run was cancelled, is carried forward to the next run. A commit whose parent is not in the clone is
 * skipped too (a shallow clone's last commit would otherwise look as if it added every file). The list stops at a
 * record commit, should one be in it.
 * @param {{ sha: string, message: string, hasParent: boolean }[]} commits newest first, from HEAD
 * @returns {string[]} shas
 */
export function pendingEditorCommits(commits) {
  const out = [];
  for (const c of commits) {
    if (isRecordCommit(c.message)) break;
    if (c.hasParent && isEditorCommit(c.message)) out.push(c.sha);
  }
  return out;
}

/**
 * The keys a changed file holds at one revision, with their fingerprints.
 * @param {(rev: string, path: string) => string | null} readAt file content at a revision, null when absent
 * @returns {{ kind: 'pages' | 'fields', values: Record<string, { en: string, ja: string }> }}
 */
export function valuesAt(readAt, rev, owner) {
  if (owner.kind === 'page') {
    const en = readAt(rev, `src/content/pages/en/${owner.rel}`);
    const ja = readAt(rev, `src/content/pages/ja/${owner.rel}`);
    const values = en !== null && ja !== null ? { [owner.slug]: { en: fingerprint(pageText(en)), ja: fingerprint(pageText(ja)) } } : {};
    return { kind: 'pages', values };
  }
  const text = readAt(rev, `src/data/${owner.file}`);
  let data = null;
  try { data = text === null ? null : JSON.parse(text); } catch { /* an unreadable file holds no keys; check-content reports it */ }
  const values = Object.fromEntries(Object.entries(scanDataFile(owner.file, data, owner.facts).fields).map(([k, v]) => [k, { en: v.en, ja: v.ja }]));
  return { kind: 'fields', values };
}

const same = (a, b) => (a?.en ?? null) === (b?.en ?? null) && (a?.ja ?? null) === (b?.ja ?? null);

/**
 * What to record for the pending editor commits. For each commit, oldest first, and each page or field whose value
 * it changed (compared with its first parent), record the whole value the commit gave it, or forget the key when the
 * commit removed it and it no longer exists. A key whose registry entry changed after that commit (a developer
 * confirmed it, by hand or with the Actions workflow) is left as the developer recorded it. See the two limits in the
 * header of this file.
 * @param {{
 *   commits: { sha: string, changed: string[] }[],                 oldest first
 *   readAt: (rev: string, path: string) => string | null,
 *   registryAt: (rev: string) => { pages: Record<string, any>, fields: Record<string, any> },
 *   registryNow: { pages: Record<string, any>, fields: Record<string, any> },
 *   existsNow: { pages: Record<string, any>, fields: Record<string, any> },
 * }} input
 * @returns {{ pages: Record<string, {en: string, ja: string}>, fields: Record<string, {en: string, ja: string}>, dropped: string[] }}
 */
export function planRecord({ commits, readAt, registryAt, registryNow, existsNow }) {
  const plan = { pages: {}, fields: {}, dropped: [] };
  const dropped = new Set();
  for (const { sha, changed } of commits) {
    const owners = new Map();
    for (const path of changed) {
      const o = ownerOf(path);
      if (o) owners.set(o.kind === 'page' ? `page:${o.slug}` : `data:${o.file}`, o);
    }
    if (!owners.size) continue;
    const registryThen = registryAt(sha);
    for (const owner of owners.values()) {
      const before = valuesAt(readAt, `${sha}^1`, owner);
      const after = valuesAt(readAt, sha, owner);
      const kind = after.kind;
      const untouchedSince = (key) => same(registryThen[kind][key], registryNow[kind][key]);
      for (const [key, value] of Object.entries(after.values)) {
        if (same(before.values[key], value) || !untouchedSince(key)) continue;
        plan[kind][key] = value;
        dropped.delete(key);
      }
      for (const key of Object.keys(before.values)) {
        if (key in after.values || existsNow[kind][key] || !untouchedSince(key) || !(key in registryNow[kind])) continue;
        delete plan[kind][key];
        dropped.add(key);
      }
    }
  }
  plan.dropped = [...dropped].sort();
  return plan;
}

/** A new registry with the plan applied; the given registry is not changed. */
export function applyPlan(registry, plan) {
  const next = { pages: { ...registry.pages, ...plan.pages }, fields: { ...registry.fields, ...plan.fields } };
  for (const key of plan.dropped) { delete next.pages[key]; delete next.fields[key]; }
  return next;
}
