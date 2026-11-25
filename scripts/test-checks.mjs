#!/usr/bin/env node
/**
 * Tests for scripts/check-content.mjs. Each case plants one bad file, expects the check to fail with a
 * specific message, then removes the file. Run: node scripts/test-checks.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const runCheck = () => spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-content.mjs')], { cwd: ROOT, encoding: 'utf8' });

/** @type {{ name: string, file: string, content: string, expect: RegExp }[]} */
const cases = [
  { name: 'an undescribed .gif photo is reported', file: 'public/img/pages/zz-test.gif', content: 'GIF89a', expect: /public\/img\/pages\/zz-test\.gif is not in images\.json/ },
  { name: 'an undescribed .svg image is reported', file: 'public/img/pages/zz-test.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"/>', expect: /public\/img\/pages\/zz-test\.svg is not in images\.json/ },
  { name: 'an undescribed .webp photo is reported', file: 'public/img/pages/zz-test.webp', content: 'RIFF', expect: /public\/img\/pages\/zz-test\.webp is not in images\.json/ },
  { name: 'an undescribed .bmp image is reported', file: 'public/img/pages/zz-test.bmp', content: 'BM', expect: /public\/img\/pages\/zz-test\.bmp is not in images\.json/ },
  { name: 'an upper-case extension is reported', file: 'public/img/pages/zz-test.GIF', content: 'GIF89a', expect: /public\/img\/pages\/zz-test\.GIF is not in images\.json/ },
  { name: 'a file with no extension is reported', file: 'public/img/pages/zz-test', content: 'x', expect: /public\/img\/pages\/zz-test is not in images\.json/ },
  { name: 'only campus-N.webp is exempt, not campus-N.gif', file: 'public/img/campus-1.gif', content: 'GIF89a', expect: /public\/img\/campus-1\.gif is not in images\.json/ },
];

let failed = 0;
const baseline = runCheck();
if (baseline.status !== 0) {
  process.stderr.write(`FAIL baseline: the check must pass on the clean tree\n${baseline.stderr}\n`);
  process.exit(1);
}
for (const c of cases) {
  const path = join(ROOT, c.file);
  if (existsSync(path)) throw new Error(`${c.file} already exists; refusing to overwrite`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, c.content);
  try {
    const r = runCheck();
    const ok = r.status !== 0 && c.expect.test(r.stderr);
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${c.name}\n`);
    if (!ok) failed += 1;
  } finally {
    rmSync(path, { force: true });
  }
}
process.stdout.write(`${cases.length - failed}/${cases.length} passed\n`);
process.exit(failed ? 1 : 0);
