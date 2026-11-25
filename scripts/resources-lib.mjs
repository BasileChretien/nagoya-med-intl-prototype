/**
 * What a built page loads from other sites: images, scripts, frames, media, stylesheets, fonts and other linked
 * resources whose address is on another host. Links a visitor clicks (<a href>) and the language and canonical
 * links in the head are not loaded, so they are not counted. The privacy page says a page loads nothing from other
 * companies; scripts/check-content.mjs --dist fails when this finds anything. Tested by scripts/test-tools.mjs.
 */

const OUTSIDE = /^(https?:)?\/\//i;
const NOT_LOADED = new Set(['canonical', 'alternate']);

/** @param {string} tag @param {string} name */
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];

/** Outside addresses a page would load. @param {string} html @returns {string[]} */
export function outsideResources(html) {
  const found = [];
  for (const m of html.matchAll(/<(img|script|iframe|video|audio|source|track|embed|object|input)\b[^>]*>/gi)) {
    for (const name of ['src', 'data', 'poster']) {
      const value = attr(m[0], name);
      if (value && OUTSIDE.test(value)) found.push(value);
    }
    const srcset = attr(m[0], 'srcset');
    if (srcset) for (const part of srcset.split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (OUTSIDE.test(url)) found.push(url);
    }
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    const rel = (attr(m[0], 'rel') ?? '').toLowerCase().split(/\s+/);
    if (href && OUTSIDE.test(href) && !rel.every((r) => NOT_LOADED.has(r))) found.push(href);
  }
  // url(...) in style blocks and style attributes (fonts, background images).
  for (const m of html.matchAll(/url\(\s*(['"]?)((?:https?:)?\/\/[^'")\s]+)\1\s*\)/gi)) found.push(m[2]);
  return found;
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
