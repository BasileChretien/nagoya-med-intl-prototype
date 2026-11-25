/**
 * Read docs/features.yaml (a small YAML subset: a list of maps with scalars and [inline, lists])
 * and draw docs/features.md from it. Shared by draw-features.mjs and check-content.mjs.
 */
import { readFileSync } from 'node:fs';

/** @typedef {{ id: string, says: string, stage: string, status: string, delivered_by: string[], tests: string[], docs?: string, limits?: string }} Feature */

/** @param {string} file @returns {Feature[]} */
export function readFeatures(file) {
  const out = [];
  let cur = null;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(raw) || !raw.trim() || raw.trim() === 'features:') continue;
    const m = raw.match(/^\s*(-\s+)?([a-z_]+):\s*(.*)$/);
    if (!m) throw new Error(`features.yaml: cannot read line "${raw}"`);
    if (m[1]) { cur = {}; out.push(cur); }
    if (!cur) throw new Error('features.yaml: field before the first entry');
    const v = m[3].trim();
    cur[m[2]] = v.startsWith('[') ? v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean) : v;
  }
  return out;
}

/** @param {Feature[]} features @returns {string} */
export function drawFeatures(features) {
  const stages = [...new Set(features.map((f) => f.stage))];
  const lines = [
    '# Feature map',
    '',
    '<!-- Drawn by scripts/draw-features.mjs from docs/features.yaml. Do not edit by hand. -->',
    '',
    '```mermaid',
    'flowchart LR',
    ...stages.map((s, i) => `  S${i}["${s}"]`),
    ...stages.slice(1).map((s, i) => `  S${i} --> S${i + 1}`),
    ...features.map((f) => `  S${stages.indexOf(f.stage)} --- ${f.id.replace(/-/g, '_')}("${f.id}${f.status === 'works' ? '' : ` (${f.status})`}")`),
    '```',
    '',
    '| Stage | Feature | What it does | Status | Checked by |',
    '| --- | --- | --- | --- | --- |',
    ...features.map((f) => `| ${f.stage} | \`${f.id}\` | ${f.says}${f.limits ? ` *Limit: ${f.limits}*` : ''} | ${f.status} | ${(f.tests ?? []).join(', ')} |`),
    '',
  ];
  return lines.join('\n');
}
