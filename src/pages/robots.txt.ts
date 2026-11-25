import type { APIRoute } from 'astro';
import { PROTOTYPE } from '../lib/launch.mjs';

/**
 * robots.txt. Search engines read it only at the root of a host, so it takes effect only when the site has its own
 * host. Under www.med.nagoya-u.ac.jp/intlexch/, the faculty's root robots.txt applies instead: docs/launch.md gives
 * the line to add there.
 * While a prototype, crawling stays allowed so that search engines can read each page's noindex tag; blocking it
 * here would hide that tag.
 */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/sitemap-index.xml`, site).toString();
  const lines = PROTOTYPE
    ? ['# Prototype: every page is marked noindex. Crawling stays allowed so search engines can read that mark.', 'User-agent: *', 'Allow: /']
    : ['User-agent: *', 'Allow: /', `Sitemap: ${sitemap}`];
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
