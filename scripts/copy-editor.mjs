#!/usr/bin/env node
/**
 * Copy the editor (Sveltia CMS, the devDependency @sveltia/cms) into public/admin/cms/, so the editing page loads its
 * code from the site itself rather than from a CDN. Runs before `npm run dev` and `npm run build` (predev, prebuild).
 * The folder is generated and kept out of git; Dependabot proposes new versions of @sveltia/cms like any dependency.
 *
 * Copied: dist/sveltia-cms.js and dist/chunks/ (loaded next to the main script, unpkg being only its fallback).
 * Not copied: source maps. What Sveltia CMS still fetches from other sites at run time is listed in
 * docs/editor-setup.md ("What the editing page loads").
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EDITOR_SCRIPT = 'public/admin/cms/sveltia-cms.js';

/** The installed @sveltia/cms package folder (createRequire also honours NODE_PATH). */
export function editorPackage(from = import.meta.url) {
  let dir = dirname(createRequire(from).resolve('@sveltia/cms'));
  while (!existsSync(join(dir, 'package.json')) || JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name !== '@sveltia/cms') {
    const up = dirname(dir);
    if (up === dir) throw new Error('@sveltia/cms: package.json not found');
    dir = up;
  }
  return dir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let pkg;
  try { pkg = editorPackage(); } catch (e) {
    process.stderr.write(`The editor package @sveltia/cms is not installed (${e.message}): run "npm ci".\n`);
    process.exit(1);
  }
  const out = join(root, 'public', 'admin', 'cms');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(pkg, 'dist', 'sveltia-cms.js'), join(out, 'sveltia-cms.js'));
  cpSync(join(pkg, 'dist', 'chunks'), join(out, 'chunks'), { recursive: true, filter: (src) => !src.endsWith('.map') });
  const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  process.stdout.write(`Copied Sveltia CMS ${version} into public/admin/cms/.\n`);
}
