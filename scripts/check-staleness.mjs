#!/usr/bin/env node
/**
 * Fails when any version has fallen behind another (the list is in staleness-report.mjs).
 * Run: node scripts/check-staleness.mjs   (part of `npm run check`)
 */
import { fileURLToPath } from 'node:url';
import { staleness } from './staleness-report.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { errors, pageCount, fieldCount } = staleness(ROOT);
for (const e of errors) process.stderr.write(`error: ${e}\n`);
process.stdout.write(`${pageCount} page pairs, ${fieldCount} bilingual fields checked; ${errors.length} out of step.\n`);
process.exit(errors.length ? 1 : 0);
