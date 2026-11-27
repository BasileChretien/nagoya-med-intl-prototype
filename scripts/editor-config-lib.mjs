/**
 * The editing page's configuration (public/admin/config.yml) against the files it edits: the content check
 * "editor-config" (scripts/check-content.mjs) fails when they no longer match, so a renamed data file, folder or field
 * breaks the check instead of the editor.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EDITOR_MARKER } from './editor-lib.mjs';

/** The editing page's configuration, relative to the repository root. */
export const EDITOR_CONFIG = 'public/admin/config.yml';
const SCHEMA_FILE = 'src/content.config.ts';

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p) => existsSync(p) && statSync(p).isFile();

/**
 * The property names each collection's schema in src/content.config.ts may hold, at any depth, keyed by what its
 * loader reads ("src/data/programmes", "src/data/news.json", "src/content/pages"). A light reading of the source, not
 * of zod: it collects every "name:" and shorthand "name," after "schema:" in each defineCollection block. Enough to
 * catch a field renamed in the data or misspelt in config.yml; not a check of depth or types.
 * @param {string} source @returns {Map<string, Set<string>>}
 */
export function schemaKeys(source) {
  const out = new Map();
  let at = 0;
  for (;;) {
    const start = source.indexOf('defineCollection(', at);
    if (start < 0) break;
    let depth = 0;
    let end = start + 'defineCollection'.length;
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      else if (source[end] === ')' && --depth === 0) break;
    }
    const block = source.slice(start, end);
    at = end;
    const loader = block.match(/base:\s*['"]\.?\/?([^'"]+)['"]/) ?? block.match(/file\(\s*['"]\.?\/?([^'"]+)['"]/);
    const schemaAt = block.indexOf('schema:');
    if (!loader || schemaAt < 0) continue;
    const schema = block.slice(schemaAt + 'schema:'.length);
    const keys = new Set(['en', 'ja']); // the pair L = { en, ja }
    if (/file\(/.test(block)) keys.add('id'); // the file() loader reads each entry's id
    for (const m of schema.matchAll(/([A-Za-z_]\w*)\s*:/g)) keys.add(m[1]);
    for (const m of schema.matchAll(/^\s*([A-Za-z_]\w*),\s*$/gm)) keys.add(m[1]);
    out.set(loader[1].replace(/\/+$/, ''), keys);
  }
  return out;
}

/** Field names of a config field list, with the path of nested object fields ("deadline.status"). */
function fieldPaths(fields, prefix = '') {
  return (Array.isArray(fields) ? fields : []).flatMap((f) => {
    if (!f?.name) return [];
    const path = `${prefix}${f.name}`;
    return [{ name: f.name, path }, ...fieldPaths(f.fields, `${path}.`)];
  });
}

/**
 * What is wrong with the editing page's configuration (already parsed from YAML):
 * - every folder (one per locale when it holds {{locale}}) and file it names exists;
 * - every field, nested object fields included, is a property of the collection's schema in src/content.config.ts
 *   (the Markdown body of a page aside), and every top-level field of a JSON collection is a key of at least one entry;
 * - every field of a translated collection says how it is translated (the default keeps a value only in the default
 *   locale, which would drop it from the other language's file);
 * - every save is marked for the deploy workflow.
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
  const schemas = isFile(join(root, SCHEMA_FILE)) ? schemaKeys(readFileSync(join(root, SCHEMA_FILE), 'utf8')) : new Map();
  for (const c of config.collections) {
    const name = c?.name ?? '(no name)';
    const fields = Array.isArray(c?.fields) ? c.fields : [];
    if (!fields.length) problems.push(`${where} ${name}: no fields`);
    const rel = (p) => String(p).replace(/^\/+/, '').replace(/\/+$/, '');
    /** @type {any[] | null} entries of a JSON collection, to check its field names against */
    let entries = null;
    let path = null;
    let markdown = false;
    if (typeof c?.file === 'string') {
      path = rel(c.file);
      if (!isFile(join(root, path))) { problems.push(`${where} ${name}: ${path} does not exist: name the data file as it is now`); continue; }
      if (path.endsWith('.json')) {
        try { const data = JSON.parse(readFileSync(join(root, path), 'utf8')); entries = Array.isArray(data) ? data : [data]; } catch { /* reported by the data checks */ }
      }
    } else if (typeof c?.folder === 'string') {
      const folders = c.folder.includes('{{locale}}') ? locales.map((l) => rel(c.folder.replaceAll('{{locale}}', l))) : [rel(c.folder)];
      if (!folders.length) { problems.push(`${where} ${name}: the folder holds {{locale}} but i18n.locales is empty`); continue; }
      const missing = folders.filter((f) => !isDir(join(root, f)));
      for (const f of missing) problems.push(`${where} ${name}: folder ${f} does not exist: name the folder as it is now`);
      if (missing.length) continue;
      path = folders[0];
      if (c.format === 'json' || c.extension === 'json') {
        entries = folders.flatMap((f) => readdirSync(join(root, f)).filter((n) => n.endsWith('.json')).flatMap((n) => {
          try { return [JSON.parse(readFileSync(join(root, f, n), 'utf8'))]; } catch { return []; }
        }));
      } else markdown = true;
    } else { problems.push(`${where} ${name}: names neither a folder nor a file`); continue; }
    if (c?.i18n) {
      for (const f of fields) if (!f || !Object.hasOwn(f, 'i18n')) problems.push(`${where} ${name}: field "${f?.name}" has no i18n setting: give it one (i18n: true keeps a value in each language)`);
    }
    const schemaPath = [...schemas.keys()].find((s) => path === s || path.startsWith(`${s}/`));
    if (!schemaPath) problems.push(`${where} ${name}: no collection in ${SCHEMA_FILE} reads ${path}`);
    else {
      const keys = schemas.get(schemaPath);
      for (const f of fieldPaths(fields)) {
        if (markdown && f.path === 'body') continue; // the Markdown text after the front matter
        if (!keys.has(f.name)) problems.push(`${where} ${name}: field "${f.path}" is not in the schema of ${SCHEMA_FILE}: use the field names given there`);
      }
    }
    if (entries) {
      const keys = new Set(entries.filter((e) => e && typeof e === 'object').flatMap((e) => Object.keys(e)));
      for (const f of fields) if (f?.name && !keys.has(f.name)) problems.push(`${where} ${name}: field "${f.name}" is in no entry of the data: use the field names of ${SCHEMA_FILE}`);
    }
  }
  return problems;
}
