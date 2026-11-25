/**
 * The language of a page on another site, from its address, or null when the address does not say.
 * Shared by src/i18n/ui.ts (source lists, news) and src/lib/rehype-abbr.mjs (links in content pages).
 * @param {string} url
 * @returns {'en' | 'ja' | null}
 */
export function urlLang(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const p = u.pathname.toLowerCase();
  if (/\/(medical_j|japanese|ja|jp)(\/|\.|$)/.test(p)) return 'ja';
  // The old exchange site's English pages live under /intlexch/english/ and /intlexch/japan/ ("Clinical Exchange in Japan").
  if (/\/(medical_e|english|en)(\/|\.|$)/.test(p) || /^\/intlexch\/japan\//.test(p)) return 'en';
  if (u.hostname === 'www.med.nagoya-u.ac.jp' && /^\/jdp\//.test(p)) return 'ja';
  return null;
}
