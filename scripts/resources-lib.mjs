/**
 * What the built site loads from other sites: images, scripts, frames, media, stylesheets, fonts and other linked
 * resources whose address is outside the site. Links a visitor clicks (<a href>) and the language and canonical
 * links in the head are not loaded, so they are not counted, and neither is an address under the site's own
 * address (origin and base path, so another project on the same host still counts as outside).
 * The privacy page says a page loads nothing from other companies; scripts/check-content.mjs --dist fails when this
 * finds anything in a page or in a built stylesheet. Tested by scripts/test-tools.mjs.
 */

const ABSOLUTE = /^(https?:)?\/\//i;
const NOT_LOADED = new Set(['canonical', 'alternate']);
const NAMED = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>' };

/**
 * Undo the entities written in attributes, such as style="background:url(&quot;...&quot;)", by name or by number
 * (&#34; &#x22;). @param {string} s
 */
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|quot|apos|amp|lt|gt);/gi, (e, code) => {
  const c = code.toLowerCase();
  if (c.startsWith('#x')) return String.fromCodePoint(parseInt(c.slice(2), 16));
  if (c.startsWith('#')) return String.fromCodePoint(parseInt(c.slice(1), 10));
  return NAMED[c] ?? e;
});

/** An attribute's value, in double or single quotes. @param {string} tag @param {string} name */
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : undefined;
};

/** An absolute or protocol-relative address, as https, for comparing. @param {string} url */
const normalise = (url) => (url.startsWith('//') ? `https:${url}` : url.replace(/^http:/i, 'https:'));

/**
 * Whether an address is outside the site. Relative addresses and fragments are the site's own, as is anything under
 * one of `own`, the site's addresses (origin and base path, for example https://example.github.io/site/).
 * @param {string} url @param {string[]} own
 */
export function isOutside(url, own = []) {
  if (!ABSOLUTE.test(url)) return false;
  const address = normalise(url);
  return !own.some((prefix) => address.startsWith(normalise(prefix)));
}

/** The addresses in a srcset or imagesrcset value. @param {string} value */
const srcsetUrls = (value) => value.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);

/**
 * Outside addresses in CSS: url(...) (fonts, backgrounds) and @import, with or without url(), with or without a
 * space or a comment before the address.
 * @param {string} css @param {string[]} [own] @returns {string[]}
 */
export function outsideInCss(css, own = []) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const found = [];
  for (const m of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]+))\s*\)/gi)) found.push(m[1] ?? m[2] ?? m[3]);
  // Minified CSS drops the space: @import"https://...". Each quote may hold the other one.
  for (const m of text.matchAll(/@import\s*(?:"([^"]+)"|'([^']+)')/gi)) found.push(m[1] ?? m[2]);
  return found.filter((u) => isOutside(u.trim(), own));
}

/**
 * Outside addresses a page would load.
 * @param {string} html @param {string[]} [own] the site's own addresses (origin and base path), not outside
 * @returns {string[]}
 */
export function outsideResources(html, own = []) {
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
  const outside = found.map(decode).filter((u) => isOutside(u, own));
  // CSS in style blocks and in style attributes, in double or single quotes.
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) outside.push(...outsideInCss(m[1], own));
  for (const m of html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) outside.push(...outsideInCss(decode(m[1] ?? m[2]), own));
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
