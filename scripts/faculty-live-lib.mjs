/**
 * Compare the live faculty pages (the faculty layer) with the international site's data.
 * Pure functions on page HTML, so they are tested on saved copies (tests/fixtures/faculty/).
 * Rules live in src/data/faculty.json under "liveChecks": "active" rules fail, "pending" ones are reported only
 * (for changes the faculty's web team has not made yet).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {{ kind: string, lang: 'en'|'ja' }} PageId */

export function loadFacultyConfig(root) {
  const faculty = JSON.parse(readFileSync(join(root, 'src', 'data', 'faculty.json'), 'utf8'));
  const contacts = JSON.parse(readFileSync(join(root, 'src', 'data', 'contacts.json'), 'utf8'));
  const office = contacts.find((c) => c.id === 'intl-office');
  const progDir = join(root, 'src', 'data', 'programmes');
  const programmes = readdirSync(progDir).filter((n) => n.endsWith('.json'))
    .map((n) => JSON.parse(readFileSync(join(progDir, n), 'utf8')))
    .filter((p) => ['study-in-nagoya', 'study-abroad', 'degrees'].includes(p.section));
  return { ...faculty, officeEmail: office.email.toLowerCase(), programmePages: [...new Set(programmes.map((p) => p.page))] };
}

/**
 * A link as "host/path/", so that the same page compares equal however it is written: relative ("/intlexch/",
 * "../intlexch/") or protocol-relative links are resolved against the page they are on; http and https, "www." or
 * not, a missing trailing slash, the query, the fragment and letter case do not count. Null for mailto: and the like.
 * @param {string} u @param {string} base address of the page the link is on @returns {string | null}
 */
function normUrl(u, base) {
  let url;
  try { url = new URL(u.trim(), base); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return `${url.hostname.replace(/^www\./i, '')}${url.pathname.replace(/\/?$/, '/')}`.toLowerCase();
}

/** Facts found on one faculty page. @param {string} html @param {PageId} id */
export function analyseFacultyPage(html, id, cfg) {
  const emails = new Set((html.match(/[\w.+-]+(?:@|◎|＠|\[at\])[\w-]+(?:\.[\w-]+)+/g) ?? [])
    .map((e) => e.replace(/◎|＠|\[at\]/g, '@').toLowerCase()));
  const pageUrl = cfg.pages?.[id.kind]?.[id.lang] ?? cfg.site.production;
  const hrefs = new Set([...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => normUrl(m[1], pageUrl)).filter(Boolean));
  // Only a link to the site's home counts (site.homes, relative to the production address): other pages under
  // /intlexch/, such as the cancer centre's /intlexch/cancerimmuno/, are not the international site.
  const linksToSite = (cfg.site.homes ?? ['']).some((h) => hrefs.has(normUrl(h, cfg.site.production)));
  const programmeLinks = cfg.programmePages.filter((p) => hrefs.has(normUrl(`${id.lang}/${p}/`, cfg.site.production)));
  return { ...id, emails, linksToSite, programmeLinks };
}

/** Rules a known gap may be recorded for: those that only pass or fail. A gap on a rule that counts (gateway)
 * could hide the page getting worse within the rule. */
const GAP_RULES = ['officeAddress', 'linksToSite'];

/**
 * Apply the rules to the analysed pages. A failure recorded in faculty.json "knownGaps" ({ rule, page, lang, since,
 * note }) is listed under "known" instead of failing, so that new drift still fails; once the page passes again, the
 * gap must be removed, and the check fails until it is.
 * @param {ReturnType<typeof analyseFacultyPage>[]} results
 * @returns {{ failures: string[], pending: string[], known: string[], passed: string[] }}
 */
export function evaluateFaculty(results, cfg) {
  const out = { failures: [], pending: [], known: [], passed: [] };
  const rules = cfg.liveChecks ?? {};
  const gaps = [];
  for (const g of cfg.knownGaps ?? []) {
    const label = `src/data/faculty.json knownGaps: ${g?.rule} on ${g?.page} (${g?.lang})`;
    if (!GAP_RULES.includes(g?.rule)) { out.failures.push(`${label}: a known gap can be recorded for only officeAddress or linksToSite, the rules that pass or fail`); continue; }
    if (!Object.hasOwn(rules, g.rule) || !rules[g.rule].pages?.includes(g.page) || !['en', 'ja'].includes(g.lang)) {
      out.failures.push(`${label} is not checked by that rule; correct or remove the entry`);
      continue;
    }
    if (typeof g.since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(g.since)) out.failures.push(`${label}: give "since", the date the gap was recorded (YYYY-MM-DD)`);
    if (typeof g.note !== 'string' || !g.note.trim()) out.failures.push(`${label}: give a "note" saying what is missing and when to remove the entry`);
    gaps.push(g);
  }
  /** @param {string} rule @param {{kind: string, lang: string}} r @param {boolean} ok @param {string} fail @param {string} does */
  const report = (rule, r, ok, fail, does) => {
    const where = `${r.kind} (${r.lang})`;
    const gap = gaps.find((g) => g.rule === rule && g.page === r.kind && g.lang === r.lang);
    if (ok && gap) out.failures.push(`${where}: now ${does}; remove its entry from knownGaps in src/data/faculty.json`);
    else if (ok) out.passed.push(`${where}: ${does}`);
    else if (gap) out.known.push(`${where}: ${fail} (known gap since ${gap.since})`);
    else if (rules[rule]?.status === 'active') out.failures.push(`${where}: ${fail}`);
    else out.pending.push(`${where}: ${fail} (pending)`);
  };
  for (const r of results) {
    if (rules.officeAddress?.pages.includes(r.kind)) {
      report('officeAddress', r, r.emails.has(cfg.officeEmail), `does not give the office address ${cfg.officeEmail}`, 'gives the office address');
    }
    if (rules.linksToSite?.pages.includes(r.kind)) {
      report('linksToSite', r, r.linksToSite, `does not link to the international site ${cfg.site.production}`, 'links to the international site');
    }
    if (rules.gateway?.pages.includes(r.kind)) {
      const missing = cfg.programmePages.length - r.programmeLinks.length;
      const lacks = [...(r.linksToSite ? [] : ["the site's home page"]), ...(missing ? [`${missing} of the ${cfg.programmePages.length} programme pages`] : [])];
      report('gateway', r, lacks.length === 0, `does not yet link to ${lacks.join(' and ')}`, 'links to the international site and every programme');
    }
  }
  return out;
}
