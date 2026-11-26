/**
 * The site's address: GitHub Pages by default. To build the same site for another host, set two values, for example
 * for the faculty server:
 *   SITE_URL=https://www.med.nagoya-u.ac.jp BASE_PATH=/intlexch npm run build
 * Read by astro.config.mjs and scripts/check-content.mjs, so the build and its checks always agree. Every link,
 * the sitemap, the feeds and the calendars follow from these two values (docs/launch.md, "Hosting").
 */
const site = process.env.SITE_URL ?? 'https://basilechretien.github.io';
const base = process.env.BASE_PATH ?? '/nagoya-med-intl-prototype';

// Fail at once with a plain message rather than build a site whose links all point to the wrong place.
if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(site)) {
  throw new Error(`SITE_URL must be an https address with no path, such as https://www.med.nagoya-u.ac.jp (got "${site}")`);
}
if (!/^(\/[A-Za-z0-9._~-]+)*$/.test(base)) {
  throw new Error(`BASE_PATH must be empty (the host's root) or a path such as /intlexch, starting with "/" and not ending with one (got "${base}")`);
}

/** The host, such as https://www.med.nagoya-u.ac.jp. */
export const SITE = site;
/** The folder the site lives in, such as /intlexch, or "" at the host's root. */
export const BASE = base;
