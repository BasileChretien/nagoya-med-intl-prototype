/**
 * Saves made in the editing page (public/admin/config.yml, Sveltia CMS) and the "both languages in step" rule.
 *
 * Every editor save is a commit whose message starts with EDITOR_MARKER (backend.commit_messages in config.yml).
 * Office staff cannot run `npm run sync -- confirm`, so for those commits only, the deploy workflow records as in
 * step the pages and fields of the files the commits changed (scripts/editor-confirm.mjs). The editor's change is
 * trusted as checked in both languages; developer commits keep the strict rule. Facts whose two languages give
 * different numbers, and fields given in one language only, still fail the check: they are not confirmed here.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { slugOf } from './staleness-lib.mjs';

export const EDITOR_MARKER = '[editor]';
/** The editing page's configuration, relative to the repository root. */
export const EDITOR_CONFIG = 'public/admin/config.yml';

/** @param {unknown} message @returns {boolean} */
export const isEditorCommit = (message) => typeof message === 'string' && message.trimStart().startsWith(EDITOR_MARKER);

/**
 * What a changed file of the repository holds in content-sync.json: a page (by slug, as pagePairs names it) or a
 * data file (as dataFiles names it, the prefix of its field keys before "#"). Other files hold nothing.
 * @param {string} path repository path, "/" or "\" separators
 * @returns {{ kind: 'page', slug: string } | { kind: 'data', file: string } | null}
 */
export function ownerOf(path) {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const page = p.match(/^src\/content\/pages\/(?:en|ja)\/(.+\.md)$/);
  if (page) return { kind: 'page', slug: slugOf(page[1]) };
  const data = p.match(/^src\/data\/((?:programmes\/)?[^/]+\.json)$/);
  if (data) return { kind: 'data', file: data[1] };
  return null;
}

const differs = (was, now) => !was || was.en !== now.en || was.ja !== now.ja;

/**
 * The registry entries to update for the files an editor changed: the pages and fields of those files that are
 * out of step (changed, or never confirmed), and the entries of those files whose page or field no longer exists
 * (an item removed in the editor). Nothing belonging to another file is touched.
 * @param {{ changed: string[], pages: Record<string, {en: string, ja: string}>, fields: Record<string, {en: string, ja: string}>, registry: { pages: Record<string, any>, fields: Record<string, any> } }} input
 * @returns {{ pages: string[], fields: string[], dropped: string[] }}
 */
export function planConfirmation({ changed, pages, fields, registry }) {
  const slugs = new Set();
  const files = new Set();
  for (const path of changed) {
    const owner = ownerOf(path);
    if (owner?.kind === 'page') slugs.add(owner.slug);
    else if (owner?.kind === 'data') files.add(owner.file);
  }
  const under = (key) => [...files].some((f) => key.startsWith(`${f}#`));
  const plan = { pages: [], fields: [], dropped: [] };
  for (const slug of [...slugs].sort()) {
    if (pages[slug]) { if (differs(registry.pages[slug], pages[slug])) plan.pages.push(slug); }
    else if (registry.pages[slug]) plan.dropped.push(slug);
  }
  for (const key of Object.keys(fields).sort()) if (under(key) && differs(registry.fields[key], fields[key])) plan.fields.push(key);
  for (const key of Object.keys(registry.fields).sort()) if (under(key) && !fields[key]) plan.dropped.push(key);
  return plan;
}

/**
 * A new registry with the plan applied; the given registry is not changed.
 * @returns {{ pages: Record<string, {en: string, ja: string}>, fields: Record<string, {en: string, ja: string}> }}
 */
export function applyPlan(registry, plan, pages, fields) {
  const next = { pages: { ...registry.pages }, fields: { ...registry.fields } };
  for (const slug of plan.pages) next.pages[slug] = { en: pages[slug].en, ja: pages[slug].ja };
  for (const key of plan.fields) next.fields[key] = { en: fields[key].en, ja: fields[key].ja };
  for (const key of plan.dropped) { delete next.pages[key]; delete next.fields[key]; }
  return next;
}

/**
 * The editor commits to take into account, newest first: HEAD and the editor commits right below it, so a run
 * cancelled by the next save (deploy.yml cancels a run in progress) is caught up by the next one. The walk stops at
 * the first commit that is not an editor save, and at a commit whose parent is not in the clone (a shallow clone's
 * last commit would otherwise look as if it added every file).
 * @param {{ sha: string, message: string, hasParent: boolean }[]} commits newest first, from HEAD
 * @returns {string[]} shas
 */
export function editorRange(commits) {
  const out = [];
  for (const c of commits) {
    if (!isEditorCommit(c.message) || !c.hasParent) break;
    out.push(c.sha);
  }
  return out;
}

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p) => existsSync(p) && statSync(p).isFile();

/**
 * What is wrong with the editing page's configuration (already parsed from YAML), so that a renamed data file or
 * field breaks the check instead of the editor: every folder and file it names exists (a folder for each locale
 * when it holds {{locale}}); every field of a JSON collection is still a key of at least one entry; every field of
 * a translated collection says how it is translated (the default keeps a value only in the default locale, which
 * would drop it from the other language's file); every save is marked for the deploy workflow.
 * @param {string} root @param {any} config @returns {string[]}
 */
export function editorConfigProblems(root, config) {
  const where = EDITOR_CONFIG;
  if (!config || typeof config !== 'object' || !Array.isArray(config.collections)) return [`${where}: no list of collections`];
  const problems = [];
  const locales = Array.isArray(config.i18n?.locales) ? config.i18n.locales : [];
  for (const kind of ['create', 'update', 'delete']) {
    const message = config.backend?.commit_messages?.[kind];
    if (typeof message !== 'string' || !message.startsWith(EDITOR_MARKER)) problems.push(`${where}: backend.commit_messages.${kind} must start with ${EDITOR_MARKER}, or the deploy cannot tell an editor save (scripts/editor-lib.mjs)`);
  }
  for (const c of config.collections) {
    const name = c?.name ?? '(no name)';
    const fields = Array.isArray(c?.fields) ? c.fields : [];
    if (!fields.length) problems.push(`${where} ${name}: no fields`);
    const rel = (p) => String(p).replace(/^\/+/, '');
    /** @type {any[]} entries of a JSON collection, to check its field names against */
    let entries = null;
    if (typeof c?.file === 'string') {
      const file = rel(c.file);
      if (!isFile(join(root, file))) { problems.push(`${where} ${name}: ${file} does not exist: name the data file as it is now`); continue; }
      if (file.endsWith('.json')) {
        try { const data = JSON.parse(readFileSync(join(root, file), 'utf8')); entries = Array.isArray(data) ? data : [data]; } catch { /* reported by the data checks */ }
      }
    } else if (typeof c?.folder === 'string') {
      const folders = c.folder.includes('{{locale}}') ? locales.map((l) => rel(c.folder.replaceAll('{{locale}}', l))) : [rel(c.folder)];
      if (!folders.length) problems.push(`${where} ${name}: the folder holds {{locale}} but i18n.locales is empty`);
      const missing = folders.filter((f) => !isDir(join(root, f)));
      for (const f of missing) problems.push(`${where} ${name}: folder ${f} does not exist: name the folder as it is now`);
      if (missing.length) continue;
      if (c.format === 'json' || c.extension === 'json') {
        entries = folders.flatMap((f) => readdirSync(join(root, f)).filter((n) => n.endsWith('.json')).flatMap((n) => {
          try { return [JSON.parse(readFileSync(join(root, f, n), 'utf8'))]; } catch { return []; }
        }));
      }
    } else problems.push(`${where} ${name}: names neither a folder nor a file`);
    if (c?.i18n) {
      for (const f of fields) if (!f || !Object.hasOwn(f, 'i18n')) problems.push(`${where} ${name}: field "${f?.name}" has no i18n setting: give it one (i18n: true keeps a value in each language)`);
    }
    if (entries) {
      const keys = new Set(entries.filter((e) => e && typeof e === 'object').flatMap((e) => Object.keys(e)));
      for (const f of fields) if (f?.name && !keys.has(f.name)) problems.push(`${where} ${name}: field "${f.name}" is in no entry of the data: use the field names of src/content.config.ts`);
    }
  }
  return problems;
}
