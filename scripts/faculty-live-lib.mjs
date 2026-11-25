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

const normUrl = (u) => u.trim().replace(/^http:\/\//i, 'https://').replace(/[#?].*$/, '').replace(/\/?$/, '/').toLowerCase();

/** Facts found on one faculty page. @param {string} html @param {PageId} id */
export function analyseFacultyPage(html, id, cfg) {
  const emails = new Set((html.match(/[\w.+-]+(?:@|◎|＠|\[at\])[\w-]+(?:\.[\w-]+)+/g) ?? [])
    .map((e) => e.replace(/◎|＠|\[at\]/g, '@').toLowerCase()));
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => normUrl(m[1]));
  // Only a link to the site's home counts (site.homes, relative to the production address): other pages under
  // /intlexch/, such as the cancer centre's /intlexch/cancerimmuno/, are not the international site.
  const homes = new Set((cfg.site.homes ?? ['']).map((h) => normUrl(`${cfg.site.production}${h}`)));
  const linksToSite = hrefs.some((h) => homes.has(h));
  const programmeLinks = cfg.programmePages.filter((p) => hrefs.includes(normUrl(`${cfg.site.production}${id.lang}/${p}/`)));
  return { ...id, emails, linksToSite, programmeLinks };
}

/**
 * @param {ReturnType<typeof analyseFacultyPage>[]} results
 * @returns {{ failures: string[], pending: string[], passed: string[] }}
 */
export function evaluateFaculty(results, cfg) {
  const out = { failures: [], pending: [], passed: [] };
  const rules = cfg.liveChecks ?? {};
  const report = (rule, ok, message, pass) => {
    if (ok) { out.passed.push(pass); return; }
    (rules[rule]?.status === 'active' ? out.failures : out.pending).push(rules[rule]?.status === 'active' ? message : `${message} (pending)`);
  };
  for (const r of results) {
    const where = `${r.kind} (${r.lang})`;
    if (rules.officeAddress?.pages.includes(r.kind)) {
      report('officeAddress', r.emails.has(cfg.officeEmail), `${where}: does not give the office address ${cfg.officeEmail}`, `${where}: gives the office address`);
    }
    if (rules.linksToSite?.pages.includes(r.kind)) {
      report('linksToSite', r.linksToSite, `${where}: does not link to the international site ${cfg.site.production}`, `${where}: links to the international site`);
    }
    if (rules.gateway?.pages.includes(r.kind)) {
      const missing = cfg.programmePages.length - r.programmeLinks.length;
      report('gateway', r.linksToSite && missing === 0,
        `${where}: does not yet link to the international site and its programmes (${r.programmeLinks.length} of ${cfg.programmePages.length} programme pages linked)`,
        `${where}: links to the international site and every programme`);
    }
  }
  return out;
}
