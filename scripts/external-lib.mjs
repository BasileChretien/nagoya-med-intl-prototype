/**
 * Outside links of the built site, checked with the audit's rules (tools/linkcheck.py in the audit folder):
 * the same user agent, one request at a time per host, HEAD first and GET when HEAD is refused, and the same
 * verdicts (report section "Measured side by side"). Used by scripts/check-external.mjs; tested offline by
 * scripts/test-tools.mjs.
 */

export const UA = 'Mozilla/5.0 (compatible; site-audit/1.0)';
export const OWN_HOST = 'www.med.nagoya-u.ac.jp';
const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

/**
 * Outside addresses in one page's markup, without fragments. Scripts are skipped (they build addresses at run
 * time). `self` is the site's own address prefix: canonical and language links point there and are not outside.
 * @param {string} html @param {string} [self] @returns {string[]}
 */
export function externalLinks(html, self) {
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const out = [];
  // (?<![\w:-]) skips data-href, xlink:href and similar attributes.
  for (const m of markup.matchAll(/(?<![\w:-])(?:href|src)="(https?:\/\/[^"]+)"/g)) {
    const url = m[1].replace(/&(amp|quot|#39|lt|gt);/g, (e) => ENTITIES[e]).split('#')[0];
    if (self && url.startsWith(self)) continue;
    out.push(url);
  }
  return out;
}

/**
 * The audit's verdict on one result: "broken" (gone, refused by the faculty's own server, or a name that does not
 * exist), "unverified" (the site refused an automated check, timed out or failed otherwise; open it by hand), or "ok".
 * @param {{ url: string, status: number | null, error?: string }} rec @returns {'ok' | 'broken' | 'unverified'}
 */
export function verdict(rec) {
  const { status } = rec;
  let host = '';
  try { host = new URL(rec.url).hostname; } catch { return 'broken'; }
  if (status === 401 || status === 404 || status === 410) return 'broken';
  if (status === 403 && host === OWN_HOST) return 'broken';
  if (status == null) return /ENOTFOUND/.test(rec.error ?? '') ? 'broken' : 'unverified';
  return status >= 400 ? 'unverified' : 'ok';
}

/** At most `n` tasks at a time. @param {number} n */
export function limiter(n) {
  let active = 0;
  /** @type {(() => void)[]} */
  const queue = [];
  const next = () => {
    if (active < n && queue.length) {
      active += 1;
      queue.shift()();
    }
  };
  /** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
  return async (fn) => {
    await new Promise((resolve) => { queue.push(() => resolve(undefined)); next(); });
    try { return await fn(); } finally { active -= 1; next(); }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Check every address: one request at a time per host, at most `concurrency` requests in all.
 * @param {string[]} urls @param {{ concurrency?: number, fetchImpl?: typeof fetch, pause?: (host: string) => number }} [opts]
 * @returns {Promise<{ url: string, status: number | null, finalUrl?: string, error?: string }[]>}
 */
export async function checkAll(urls, opts = {}) {
  const { concurrency = 12, fetchImpl = fetch, pause = (h) => (h === OWN_HOST ? 200 : 100) } = opts;
  const slot = limiter(concurrency);
  /** @type {Map<string, Promise<unknown>>} */
  const chains = new Map();
  const request = async (url, method, ms) => {
    const res = await fetchImpl(url, { method, redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms) });
    if (method === 'GET') await res.body?.cancel().catch(() => {});
    return res;
  };
  const one = (url) => {
    let host = '';
    try { host = new URL(url).hostname; } catch { return Promise.resolve({ url, status: null, error: 'Invalid address' }); }
    const task = () => slot(async () => {
      await sleep(pause(host));
      try {
        let r = await request(url, 'HEAD', 20000);
        if (r.status === 403 || r.status === 405 || r.status === 501 || r.status >= 500) r = await request(url, 'GET', 25000);
        return { url, status: r.status, finalUrl: r.url };
      } catch (e) {
        const err = /** @type {any} */ (e);
        return { url, status: null, error: `${err.name}: ${err.cause?.code ?? err.message}`.slice(0, 160) };
      }
    });
    const run = (chains.get(host) ?? Promise.resolve()).then(task, task);
    chains.set(host, run.catch(() => {}));
    return run;
  };
  return Promise.all(urls.map(one));
}

/**
 * The weekly report in Markdown, and whether anything needs a person.
 * @param {{ checked: string, results: { url: string, status: number | null, error?: string, places: string[] }[], content: { code: number, output: string } }} input
 * @returns {{ markdown: string, problems: boolean }}
 */
export function weeklyReport({ checked, results, content }) {
  const broken = results.filter((r) => verdict(r) === 'broken');
  const unverified = results.filter((r) => verdict(r) === 'unverified');
  const places = results.reduce((n, r) => n + r.places.length, 0);
  const contentLines = content.output.split(/\r?\n/).filter((l) => /^(error|warning): /.test(l));
  const MAX = 80;
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  const where = (r) => r.places.slice(0, 3).map((p) => `\`${p}\``).join(', ') + (r.places.length > 3 ? ` and ${r.places.length - 3} more` : '');
  const result = (r) => (r.status == null ? cell(r.error ?? 'no answer') : String(r.status));
  const table = (rows) => [
    '| Address | Result | Pages |',
    '| --- | --- | --- |',
    ...rows.slice(0, MAX).map((r) => `| ${cell(r.url)} | ${result(r)} | ${where(r)} |`),
    ...(rows.length > MAX ? [`| … and ${rows.length - MAX} more | | |`] : []),
  ];
  const md = [
    `# Weekly check, ${checked}`,
    '',
    '## Content checks (deadlines, pairs, data)',
    '',
    content.code === 0 && contentLines.length === 0 ? 'Nothing found.' : contentLines.map((l) => `- ${l}`).join('\n'),
    '',
    '## Outside links',
    '',
    `${results.length} addresses checked, used in ${places} places.`,
    '',
    `### Broken (${broken.length})`,
    '',
    ...(broken.length ? [...table(broken), '', 'Fix the link in the page or data file, or remove it.'] : ['None.']),
    '',
    `### Could not be checked (${unverified.length})`,
    '',
    ...(unverified.length
      ? ['Some sites refuse automated checks or answered too slowly. Open these by hand if they stay on this list.', '', ...table(unverified)]
      : ['None.']),
    '',
  ].join('\n');
  return { markdown: md, problems: broken.length > 0 || content.code !== 0 || contentLines.length > 0 };
}
