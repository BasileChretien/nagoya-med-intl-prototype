/**
 * What the built site loads from other sites: images, scripts, frames, media, stylesheets, fonts and other linked
 * resources whose address is outside the site. Links a visitor clicks (<a href>) and the language and canonical
 * links in the head are not loaded, so they are not counted, and neither is an address under the site's own
 * address (host and base path, so another project on the same host still counts as outside).
 * Pages are read with parse5 (scripts/html-lib.mjs) and CSS with css-tree, as a browser would read them, so quotes,
 * entities, comments and strings need no special cases here.
 * The privacy page says a page loads nothing from other companies; scripts/check-content.mjs --dist fails when this
 * finds anything in a page or in a built stylesheet. Tested by scripts/test-tools.mjs.
 */
import * as csstree from 'css-tree';
import { markdownToHtml } from 'satteri';
import { toDocument, elements, attrs, attr, text } from './html-lib.mjs';

const ABSOLUTE = /^(https?:)?\/\//i;
const MEDIA = new Set(['img', 'script', 'iframe', 'video', 'audio', 'source', 'track', 'embed', 'object', 'input']);
const SVG_LINKS = new Set(['image', 'use', 'feImage']);
const NOT_LOADED = new Set(['canonical', 'alternate']);

/**
 * Whether an address is outside the site. Relative addresses, fragments and inline data are the site's own, as is
 * anything under one of `own`, the site's addresses (for example https://example.github.io/site/). Addresses are
 * compared once parsed: host names in any case, default ports and ".." segments come out as a browser reads them.
 * @param {string} url @param {string[]} [own]
 */
export function isOutside(url, own = []) {
  const value = url.trim();
  if (!ABSOLUTE.test(value)) return false;
  let address;
  try {
    address = new URL(value, 'https://relative.invalid/');
  } catch {
    return true; // an absolute address that cannot be read is reported rather than trusted
  }
  return !own.some((prefix) => {
    try {
      const site = new URL(prefix);
      return address.host === site.host && address.pathname.startsWith(site.pathname);
    } catch {
      return false;
    }
  });
}

/**
 * Outside addresses in CSS: every url(...) (fonts, backgrounds, @import url()) and the string of an @import.
 * @param {string} css @param {string[]} [own] @param {'stylesheet' | 'declarationList'} [context] declarationList for a style attribute
 * @returns {string[]}
 */
export function outsideInCss(css, own = [], context = 'stylesheet') {
  let ast;
  try {
    ast = csstree.parse(css, { context, parseValue: true, parseAtrulePrelude: true, onParseError: () => {} });
  } catch {
    return [];
  }
  const found = [];
  csstree.walk(ast, (node) => {
    if (node.type === 'Url') found.push(node.value);
    else if (node.type === 'Atrule' && node.name.toLowerCase() === 'import' && node.prelude) {
      csstree.walk(node.prelude, (part) => { if (part.type === 'String') found.push(part.value); });
    }
  });
  return found.filter((u) => isOutside(u, own));
}

/** The addresses in a srcset or imagesrcset value. @param {string} value */
const srcsetUrls = (value) => value.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);

/**
 * Outside addresses a page would load.
 * @param {string | import('./html-lib.mjs').Node} page the page text, or a document parsed once by the caller
 * @param {string[]} [own] the site's own addresses (host and base path), not outside
 * @returns {string[]}
 */
export function outsideResources(page, own = []) {
  const found = [];
  const css = [];
  for (const el of elements(toDocument(page))) {
    const tag = el.tagName ?? '';
    if (MEDIA.has(tag)) {
      for (const name of ['src', 'data', 'poster']) found.push(...attrs(el, name));
      for (const value of attrs(el, 'srcset')) found.push(...srcsetUrls(value));
    } else if (SVG_LINKS.has(tag)) {
      found.push(...attrs(el, 'href')); // href and xlink:href
    } else if (tag === 'link') {
      const rel = (attr(el, 'rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!rel.length || !rel.every((r) => NOT_LOADED.has(r))) {
        found.push(...attrs(el, 'href'));
        for (const value of attrs(el, 'imagesrcset')) found.push(...srcsetUrls(value));
      }
    } else if (tag === 'style') {
      css.push(...outsideInCss(text(el), own));
    }
    for (const value of attrs(el, 'style')) css.push(...outsideInCss(value, own, 'declarationList'));
  }
  return [...found.filter((u) => isOutside(u, own)), ...css];
}

/**
 * Outside addresses linked from a Markdown page, read by rendering it with satteri, the Markdown processor the site
 * uses, so every form counts: [t](url), titles, <url>, reference definitions, autolinks and raw <a href>.
 * Used by the summaries check (check-content 3e).
 * @param {string} body Markdown without its front matter @returns {Promise<string[]>}
 */
export async function outsideLinks(body) {
  const rendered = await markdownToHtml(body);
  const html = String(rendered?.html ?? rendered);
  const found = [];
  for (const el of elements(toDocument(html))) {
    if (el.tagName !== 'a') continue;
    for (const href of attrs(el, 'href')) if (/^https?:\/\//i.test(href)) found.push(href);
  }
  return found;
}
