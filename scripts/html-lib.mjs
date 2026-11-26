/**
 * Reading built pages with a real HTML parser (parse5, the WHATWG algorithm browsers follow), so the checks see what
 * a browser sees: quotes of any kind, entities by name or number, comments, and script and style text kept apart
 * from the markup. Used by scripts/check-content.mjs --dist, scripts/resources-lib.mjs, scripts/structured-lib.mjs
 * and scripts/external-lib.mjs.
 */
import { parse } from 'parse5';

/** @typedef {{ nodeName: string, tagName?: string, attrs?: { name: string, value: string, prefix?: string }[], childNodes?: Node[], content?: Node, value?: string }} Node */

/**
 * A parsed document from page text, or the document itself when one is given. <noscript> content is read as markup
 * (scriptingEnabled: false): it is what visitors without JavaScript get, so its links and images are checked too.
 * @param {string | Node} page @returns {Node}
 */
export function toDocument(page) {
  return typeof page === 'string' ? parse(page, { scriptingEnabled: false }) : page;
}

/**
 * Every element, in document order, including those inside <template>.
 * @param {Node} root @returns {Generator<Node>}
 */
export function* elements(root) {
  const stack = [root];
  while (stack.length) {
    const node = /** @type {Node} */ (stack.pop());
    if (node.tagName) yield node;
    const children = [...(node.childNodes ?? []), ...(node.content?.childNodes ?? [])];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
}

/**
 * The values of an element's attributes with this name. SVG's xlink:href is read as href (parse5 keeps the prefix
 * apart), so asking for "href" gives both.
 * @param {Node} el @param {string} name @returns {string[]}
 */
export function attrs(el, name) {
  return (el.attrs ?? []).filter((a) => a.name === name).map((a) => a.value);
}

/** The first value of an attribute, or undefined. @param {Node} el @param {string} name */
export function attr(el, name) {
  return attrs(el, name)[0];
}

/** The text inside an element (a script or a style). @param {Node} el */
export function text(el) {
  return (el.childNodes ?? []).filter((c) => c.nodeName === '#text').map((c) => c.value ?? '').join('');
}
