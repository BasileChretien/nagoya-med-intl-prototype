#!/usr/bin/env node
/**
 * Record that English and Japanese versions are in step (see staleness-lib.mjs).
 *
 *   npm run sync -- status                     list everything out of step
 *   npm run sync -- confirm <key> [<key>...]   after updating BOTH languages: record them as in step
 *                                              key = a page slug ("study-in-nagoya/faq") or a field
 *                                              ("programmes/clinical-clerkship.json#duration")
 *   npm run sync -- prune                      forget entries whose page or field no longer exists
 *   npm run sync -- stamp-report <id> [...]    after updating a report translation: record its original's version
 *   npm run sync -- adopt                      first use only: record the current state of everything
 *
 * Only confirm what you have checked: confirming is the statement "both languages now say the same thing".
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNC_FILE, pagePairs, dataFields, readRegistry, comparePages, compareFields, reportFingerprint } from './staleness-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [command, ...args] = process.argv.slice(2);

const strip = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { en: v.en, ja: v.ja }]));
const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
function save(registry) {
  writeFileSync(join(ROOT, SYNC_FILE), `${JSON.stringify({ pages: sorted(registry.pages), fields: sorted(registry.fields) }, null, 1)}\n`);
}
function die(msg) { process.stderr.write(`${msg}\n`); process.exit(1); }

const pages = pagePairs(ROOT);
const fields = dataFields(ROOT);

switch (command) {
  case 'status': {
    const reg = readRegistry(ROOT) ?? { pages: {}, fields: {} };
    const errors = [...comparePages(pages, reg.pages), ...compareFields(fields, reg.fields)];
    for (const e of errors) process.stdout.write(`${e}\n`);
    process.stdout.write(`${errors.length} out of step\n`);
    process.exit(errors.length ? 1 : 0);
    break;
  }
  case 'confirm': {
    if (!args.length) die('Name what to confirm: a page slug or a field key (see "npm run sync -- status").');
    const reg = readRegistry(ROOT) ?? die(`${SYNC_FILE} is missing: run "npm run sync -- adopt" first.`);
    for (const key of args) {
      if (pages[key]) reg.pages[key] = pages[key];
      else if (fields[key]) reg.fields[key] = { en: fields[key].en, ja: fields[key].ja };
      else {
        // a whole data entry: confirm every field under it ("images.json#<id>")
        const under = Object.keys(fields).filter((k) => k.startsWith(`${key}/`) || k.startsWith(`${key.replace(/#$/, '')}#`));
        if (!under.length) die(`Unknown page or field: ${key}`);
        for (const k of under) reg.fields[k] = { en: fields[k].en, ja: fields[k].ja };
      }
      process.stdout.write(`confirmed ${key}\n`);
    }
    save(reg);
    break;
  }
  case 'prune': {
    const reg = readRegistry(ROOT) ?? die(`${SYNC_FILE} is missing.`);
    let n = 0;
    for (const k of Object.keys(reg.pages)) if (!pages[k]) { delete reg.pages[k]; n += 1; }
    for (const k of Object.keys(reg.fields)) if (!fields[k]) { delete reg.fields[k]; n += 1; }
    save(reg);
    process.stdout.write(`removed ${n} entries\n`);
    break;
  }
  case 'stamp-report': {
    if (!args.length) die('Name the report ids to stamp.');
    for (const id of args) {
      const o = join(ROOT, 'src', 'data', 'reports', 'original', `${id}.json`);
      const t = join(ROOT, 'src', 'data', 'reports', 'translated', `${id}.json`);
      if (!existsSync(o) || !existsSync(t)) die(`No original and translation for ${id}`);
      const translation = JSON.parse(readFileSync(t, 'utf8'));
      translation.sourceFingerprint = reportFingerprint(JSON.parse(readFileSync(o, 'utf8')));
      writeFileSync(t, JSON.stringify(translation, null, 1));
      process.stdout.write(`stamped ${id}\n`);
    }
    break;
  }
  case 'adopt': {
    if (existsSync(join(ROOT, SYNC_FILE))) die(`${SYNC_FILE} already exists: use "confirm" for what you have checked.`);
    save({ pages, fields: strip(fields) });
    process.stdout.write(`recorded ${Object.keys(pages).length} page pairs and ${Object.keys(fields).length} fields\n`);
    break;
  }
  default:
    die('Usage: npm run sync -- status | confirm <key...> | prune | stamp-report <id...> | adopt');
}
