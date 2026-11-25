#!/usr/bin/env node
// Redraw docs/features.md from docs/features.yaml.
import { writeFileSync } from 'node:fs';
import { readFeatures, drawFeatures } from './features.mjs';

const root = new URL('..', import.meta.url);
const features = readFeatures(new URL('docs/features.yaml', root));
writeFileSync(new URL('docs/features.md', root), drawFeatures(features));
process.stdout.write(`docs/features.md drawn from ${features.length} features.\n`);
