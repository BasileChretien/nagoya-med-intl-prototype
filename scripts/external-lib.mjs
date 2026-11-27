/**
 * Outside links of the built site, checked with the audit's rules (tools/linkcheck.py in the audit folder):
 * the same user agent, one request at a time per host, HEAD first and GET when HEAD is refused, and the same
 * verdicts (report section "Measured side by side"). Used by scripts/weekly-check.mjs; tested offline by
 * scripts/test-tools.mjs.
 */
import { toDocument, elements, attrs } from './html-lib.mjs';

export const UA = 'Mozilla/5.0 (compatible; site-audit/1.0)';
export const OWN_HOST = 'www.med.nagoya-u.ac.jp';

/**
 * Outside addresses in one page, without fragments: every href and src that is a full http(s) address, read with
 * parse5 (entities decoded, any quoting). That includes a script's own src, SVG xlink:href (parse5 reads it as
 * href), and links inside <noscript> and <template>: all of them can lead a visitor or a browser somewhere, so all
 * are checked. Text inside scripts is not markup and is not read: scripts build some addresses at run time.
 * `self` is the site's own address prefix: canonical and language links point there.
 * @param {string | import('./html-lib.mjs').Node} page @param {string} [self] @returns {string[]}
 */
export function externalLinks(page, self) {
  const out = [];
  for (const el of elements(toDocument(page))) {
    for (const value of [...attrs(el, 'href'), ...attrs(el, 'src')]) {
      if (!/^https?:\/\//i.test(value)) continue;
      const url = value.split('#')[0];
      if (self && url.startsWith(self)) continue;
      out.push(url);
    }
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

/**
 * The entries of src/data/protected-areas.json that can be checked: an object with a string id and a full https
 * address. check-content reports the others; the weekly check skips them instead of stopping.
 * @param {unknown} list @returns {{ id: string, url: string, name?: { en?: string, ja?: string } }[]}
 */
export function usableAreas(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((a) => a && typeof a === 'object' && typeof a.id === 'string' && a.id && typeof a.url === 'string' && /^https:\/\/[^/]+\/./.test(a.url));
}

/** Host (lower case, with a port only when it is not 80 or 443) and path of an address, or null. @param {string} u */
function hostPath(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    return `${x.hostname}${x.port && x.port !== '80' && x.port !== '443' ? `:${x.port}` : ''}${x.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Whether an address lies in one of the password-protected areas the site links to but does not hold
 * (src/data/protected-areas.json): the area's own address, with or without its final slash, or anything under it.
 * Addresses are compared by host and path, so http or https, the host's letter case and a default port do not matter.
 * @param {string} url @param {{ url: string }[]} areas
 */
export function inArea(url, areas) {
  const here = hostPath(url);
  if (!here) return false;
  return areas.some((a) => {
    const area = hostPath(a.url);
    if (!area) return false;
    const folder = area.endsWith('/') ? area : `${area}/`;
    return here === area || here === folder.slice(0, -1) || here.startsWith(folder);
  });
}

/**
 * The verdict on one protected area, asked for without a password and without following redirects:
 * "protected" (it asks for a password, as it should), "open" (it answers without one: what it holds is public),
 * "moved" (it sends visitors elsewhere, for example after a redirect rule caught it: members cannot reach it),
 * "missing" (not found: the folder was deleted or moved), or "unverified" (no answer, or another status).
 * @param {{ status: number | null, auth?: string | null }} rec @returns {'protected' | 'open' | 'moved' | 'missing' | 'unverified'}
 */
export function protectedVerdict(rec) {
  const { status, auth } = rec;
  if (status === 401 && auth) return 'protected';
  if (status == null) return 'unverified';
  if (status >= 200 && status < 300) return 'open';
  if (status >= 300 && status < 400) return 'moved';
  if (status === 404 || status === 410) return 'missing';
  return 'unverified';
}

/**
 * Ask each protected area for its page, as a visitor without the password would, one after the other.
 * @param {{ id: string, url: string, name?: { en?: string } }[]} areas @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ id: string, url: string, name: string, status: number | null, auth?: string | null, location?: string | null, error?: string }[]>}
 */
export async function checkProtected(areas, opts = {}) {
  const { fetchImpl = fetch } = opts;
  const out = [];
  for (const a of areas) {
    const base = { id: a.id, url: a.url, name: a.name?.en ?? a.id };
    try {
      const res = await fetchImpl(a.url, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
      await res.body?.cancel().catch(() => {});
      out.push({ ...base, status: res.status, auth: res.headers.get('www-authenticate'), location: res.headers.get('location') });
    } catch (e) {
      const err = /** @type {any} */ (e);
      out.push({ ...base, status: null, error: `${err.name}: ${err.cause?.code ?? err.message}`.slice(0, 160) });
    }
  }
  return out;
}

const AREA_RESULT = {
  protected: () => 'Asks for a password, as it should.',
  open: () => '**Answers without a password: what it holds may be public. Tell faculty IT today.**',
  moved: (r) => `**Sends visitors to ${r.location || 'another address'}: members cannot reach it. Check the redirects in \`/intlexch/.htaccess\` (docs/launch.md).**`,
  missing: () => '**Not found: the folder may have been deleted or moved. Tell faculty IT.**',
  unverified: (r) => `Could not be checked (${r.status ?? r.error ?? 'no answer'}). Open it by hand if it stays on this list.`,
};

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
 * A protected area that answers without a password, sends visitors elsewhere or is gone needs a person; one that
 * could not be checked is listed without opening an issue, like an outside site that refuses checks.
 * @param {{ checked: string, results: { url: string, status: number | null, error?: string, places: string[] }[], content: { code: number, output: string }, areas?: { url: string, name: string, status: number | null, auth?: string | null, location?: string | null, error?: string }[] }} input
 * @returns {{ markdown: string, full: string, problems: boolean }} `markdown` fits in an issue; `full` is for the run summary
 */
export function weeklyReport({ checked, results, content, areas = [] }) {
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
  // A check that stopped without its own error lines (a crash) is shown with its exit code and last lines.
  const crashed = content.code !== 0 && !contentLines.some((l) => l.startsWith('error: '));
  const tail = content.output.trim().split(/\r?\n/).slice(-20).join('\n').replace(/```/g, "'''");
  const contentPart = content.code === 0 && contentLines.length === 0
    ? ['Nothing found.']
    : [
      ...contentLines.slice(0, MAX).map((l) => `- ${l}`),
      ...(contentLines.length > MAX ? [`- … and ${contentLines.length - MAX} more`] : []),
      ...(crashed ? ['', `The content check stopped with exit code ${content.code}. Its last lines:`, '', '```', tail, '```'] : []),
    ];
  const md = [
    `# Weekly check, ${checked}`,
    '',
    '## Content checks (deadlines, pairs, data)',
    '',
    ...contentPart,
    '',
    ...(areas.length
      ? [
        '## Password-protected areas',
        '',
        'The site links to these areas but does not hold them. Each must keep asking for a password.',
        '',
        'This check asks without the password, so it cannot see a redirect that the server applies only after a member signs in (a redirect written in an `.htaccess` file). After any change to the redirects, someone with the members\' ID should sign in once and confirm the area still opens (docs/launch.md).',
        '',
        '| Area | Result |',
        '| --- | --- |',
        ...areas.map((a) => `| ${cell(a.name)} (${cell(a.url)}) | ${cell(AREA_RESULT[protectedVerdict(a)](a))} |`),
        '',
      ]
      : []),
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
  const areaAlarm = areas.some((a) => ['open', 'moved', 'missing'].includes(protectedVerdict(a)));
  return { markdown: capReport(md), full: md, problems: broken.length > 0 || content.code !== 0 || contentLines.length > 0 || areaAlarm };
}

/** GitHub refuses an issue body over 65,536 characters; keep the report under that, saying so when it is cut. */
export const ISSUE_LIMIT = 65536;
const ROOM = ISSUE_LIMIT - 2000; // the workflow adds a link to the run
/** @param {string} md */
function capReport(md) {
  if (md.length <= ROOM) return md;
  const note = '\n\n… The report was cut here because it is too long for an issue. The run summary has it in full.\n';
  const cut = md.slice(0, ROOM - note.length - 4).replace(/\n[^\n]*$/, '');
  // A cut inside a fenced block would leave the note, and everything after it, shown as code: close it first.
  const insideFence = ((cut.match(/^```/gm) ?? []).length % 2) === 1;
  return `${cut}${insideFence ? '\n```' : ''}${note}`;
}
