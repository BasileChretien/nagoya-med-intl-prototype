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
const NO_SITE = 'https://relative.invalid/';

/**
 * Whether an address is outside the site. Every value is resolved with the WHATWG URL parser, as a browser resolves
 * it against the address of the page or stylesheet that holds it (`base`; the site's address, the first of `own`,
 * when none is given): host names in any case, default ports, ".." segments and backslashes (a browser reads
 * "/\host/x" as "//host/x") all come out as the browser reads them. Inline data (data:, blob:) and other schemes
 * load nothing from another site. An address is the site's own when it is under one of `own` (host and base path).
 * @param {string} url @param {string[]} [own] @param {string} [base] the address of the page or stylesheet
 */
export function isOutside(url, own = [], base = undefined) {
  const value = url.trim();
  if (!value) return false;
  let address;
  try {
    address = new URL(value, base ?? own[0] ?? NO_SITE);
  } catch {
    return ABSOLUTE.test(value); // an absolute address that cannot be read is reported rather than trusted
  }
  if (address.protocol !== 'http:' && address.protocol !== 'https:') return false;
  if (address.host === new URL(NO_SITE).host) return false; // relative, with no site address to resolve against
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
 * The addresses in CSS found by simple patterns, used only when css-tree cannot read a stylesheet at all, so that
 * an unreadable stylesheet is still scanned rather than passed unseen. @param {string} css @returns {string[]}
 */
export function cssAddressesByPattern(css) {
  const found = [];
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]+))\s*\)/gi)) found.push(m[1] ?? m[2] ?? m[3]);
  for (const m of css.matchAll(/@import\s*(?:"([^"]+)"|'([^']+)')/gi)) found.push(m[1] ?? m[2]);
  return found;
}

/**
 * Outside addresses in CSS: every url(...) (fonts, backgrounds, @import url(), and inside custom properties such as
 * --hero: url(...)) and the string of an @import. Relative addresses are read against `base`: the stylesheet's own
 * address for a .css file, the page's address for a <style> block or a style attribute.
 * @param {string} css @param {string[]} [own]
 * @param {{ context?: 'stylesheet' | 'declarationList', base?: string, parse?: typeof csstree.parse }} [options]
 *   context: declarationList for a style attribute; parse: replaces css-tree's parser (tests of the fallback)
 * @returns {string[]}
 */
export function outsideInCss(css, own = [], { context = 'stylesheet', base, parse = csstree.parse } = {}) {
  return cssAddresses(css, { context, parse }).filter((u) => isOutside(u, own, base));
}

/**
 * Every address in CSS, as written: url(...) (also inside custom properties) and @import strings. A stylesheet
 * css-tree cannot read is scanned by simple patterns instead (cssAddressesByPattern).
 * @param {string} css @param {{ context?: 'stylesheet' | 'declarationList', parse?: typeof csstree.parse }} [options]
 * @returns {string[]}
 */
export function cssAddresses(css, { context = 'stylesheet', parse = csstree.parse } = {}) {
  let ast;
  try {
    // parseCustomProperty: a custom property's value is parsed too, so a url() in it is a Url node like any other.
    ast = parse(css, { context, parseValue: true, parseAtrulePrelude: true, parseCustomProperty: true, onParseError: () => {} });
  } catch {
    return cssAddressesByPattern(css);
  }
  const found = [];
  csstree.walk(ast, (node) => {
    if (node.type === 'Url') found.push(node.value);
    else if (node.type === 'Atrule' && node.name.toLowerCase() === 'import' && node.prelude) {
      csstree.walk(node.prelude, (part) => { if (part.type === 'String') found.push(part.value); });
    }
  });
  return found;
}

/** The addresses in a srcset or imagesrcset value. @param {string} value */
const srcsetUrls = (value) => value.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);

/**
 * Every address a page would load, as written: media and script sources, srcset, SVG links, linked resources other
 * than canonical and language links, and every address in its <style> blocks and style attributes.
 * @param {string | import('./html-lib.mjs').Node} page the page text, or a document parsed once by the caller
 * @returns {string[]}
 */
export function loadedAddresses(page) {
  const found = [];
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
      found.push(...cssAddresses(text(el)));
    }
    for (const value of attrs(el, 'style')) found.push(...cssAddresses(value, { context: 'declarationList' }));
  }
  return found;
}

/**
 * Outside addresses a page would load.
 * @param {string | import('./html-lib.mjs').Node} page the page text, or a document parsed once by the caller
 * @param {string[]} [own] the site's own addresses (host and base path), not outside
 * @param {string} [base] the page's own address, against which its relative addresses are read
 * @returns {string[]}
 */
export function outsideResources(page, own = [], base = undefined) {
  return loadedAddresses(page).filter((u) => isOutside(u, own, base));
}

/** Whether an address is relative to the page it is on (not a full address, not from the site root, not a fragment). @param {string} url */
export const isPageRelative = (url) => !/^([a-z][a-z0-9+.-]*:|[/\\]|#)/i.test(url.trim());

/**
 * The address a built file is served at, against which its relative addresses are read: the folder for an
 * index.html (build.format 'directory'), the file itself otherwise. Each path segment is encoded, so a name holding
 * "%", "#" or "?" stays part of the path. Undefined without a site address.
 * @param {string} rel the file's path inside dist/, with "/" separators @param {string} [siteAddress] for example https://example.github.io/site/
 */
export function servedAt(rel, siteAddress) {
  if (!siteAddress) return undefined;
  const path = rel.replace(/(^|\/)index\.html$/, '$1').split('/').map(encodeURIComponent).join('/');
  return new URL(path, siteAddress).toString();
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
