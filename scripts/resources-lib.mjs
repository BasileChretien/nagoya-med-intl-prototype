/**
 * What the built site loads from other sites: images, scripts, frames, media, stylesheets, fonts and other linked
 * resources whose address is on another host. Links a visitor clicks (<a href>) and the language and canonical
 * links in the head are not loaded, so they are not counted, and neither is an address on the site's own host.
 * The privacy page says a page loads nothing from other companies; scripts/check-content.mjs --dist fails when this
 * finds anything in a page or in a built stylesheet. Tested by scripts/test-tools.mjs.
 */

const ABSOLUTE = /^(https?:)?\/\//i;
const NOT_LOADED = new Set(['canonical', 'alternate']);
const ENTITIES = { '&quot;': '"', '&#34;': '"', '&#39;': "'", '&apos;': "'", '&amp;': '&' };

/** Undo the entity quotes Astro writes in attributes, such as style="background:url(&quot;...&quot;)". @param {string} s */
const decode = (s) => s.replace(/&(quot|#34|#39|apos|amp);/g, (e) => ENTITIES[e]);

/** @param {string} tag @param {string} name */
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];

/**
 * Whether an address is on another host than the site's own. Relative addresses and fragments are the site's own.
 * @param {string} url @param {string[]} ownHosts
 */
export function isOutside(url, ownHosts = []) {
  if (!ABSOLUTE.test(url)) return false;
  try {
    return !ownHosts.includes(new URL(url.startsWith('//') ? `https:${url}` : url).hostname);
  } catch {
    return true;
  }
}

/** The addresses in a srcset or imagesrcset value. @param {string} value */
const srcsetUrls = (value) => value.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);

/**
 * Outside addresses in CSS: url(...) (fonts, backgrounds) and @import, with or without url().
 * @param {string} css @param {string[]} [ownHosts] @returns {string[]}
 */
export function outsideInCss(css, ownHosts = []) {
  const found = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi)) found.push(m[2]);
  for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/gi)) found.push(m[2]);
  return found.filter((u) => isOutside(u, ownHosts));
}

/**
 * Outside addresses a page would load.
 * @param {string} html @param {string[]} [ownHosts] the site's own host names, whose addresses are not outside
 * @returns {string[]}
 */
export function outsideResources(html, ownHosts = []) {
  const found = [];
  for (const m of html.matchAll(/<(img|script|iframe|video|audio|source|track|embed|object|input)\b[^>]*>/gi)) {
    for (const name of ['src', 'data', 'poster']) {
      const value = attr(m[0], name);
      if (value) found.push(value);
    }
    const srcset = attr(m[0], 'srcset');
    if (srcset) found.push(...srcsetUrls(srcset));
  }
  // SVG images and sprites, in either attribute name.
  for (const m of html.matchAll(/<(image|use|feImage)\b[^>]*>/g)) {
    for (const name of ['href', 'xlink:href']) {
      const value = attr(m[0], name);
      if (value) found.push(value);
    }
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], 'rel') ?? '').toLowerCase().split(/\s+/);
    if (rel.every((r) => NOT_LOADED.has(r))) continue;
    const href = attr(m[0], 'href');
    if (href) found.push(href);
    const imagesrcset = attr(m[0], 'imagesrcset');
    if (imagesrcset) found.push(...srcsetUrls(imagesrcset));
  }
  const outside = found.map(decode).filter((u) => isOutside(u, ownHosts));
  // CSS in style blocks and style attributes.
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) outside.push(...outsideInCss(m[1], ownHosts));
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) outside.push(...outsideInCss(decode(m[1]), ownHosts));
  return outside;
}

/**
 * Outside addresses linked from a Markdown page, in every form Markdown and HTML allow: [t](url), [t](url "title"),
 * [t](<url>), reference definitions ([id]: url) and <a href="url">. Used by the summaries check (check-content 3e).
 * @param {string} body @returns {string[]}
 */
export function outsideLinks(body) {
  const found = [];
  for (const m of body.matchAll(/\]\(\s*<?(https?:\/\/[^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g)) found.push(m[1]);
  for (const m of body.matchAll(/^ {0,3}\[[^\]]+\]:\s*<?(https?:\/\/[^\s>]+)>?/gm)) found.push(m[1]);
  for (const m of body.matchAll(/<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) found.push(m[1]);
  return found;
}
