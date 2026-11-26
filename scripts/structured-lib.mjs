/**
 * Checks the structured data (JSON-LD) in a built page: each block parses, names schema.org and a type, and every
 * address in it is a full https address; `missingTypes` says which expected types a page lacks (the office on the
 * home pages, the breadcrumb trail on content pages), so that blocks that disappear are noticed too.
 * The blocks are found with parse5 (scripts/html-lib.mjs): any attribute order or quoting, and a type written in
 * any case. Used by scripts/check-content.mjs --dist; tested by scripts/test-tools.mjs.
 */
import { toDocument, elements, attr, text } from './html-lib.mjs';

const URL_KEYS = new Set(['url', 'item', '@id', 'sameAs', 'logo', 'image']);

/** A JSON-LD node reference, such as {"@id": "https://example.org/#org"}: it points at an item described elsewhere. @param {any} item */
const isReference = (item) => item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 1 && typeof item['@id'] === 'string';

/** An item's type as text ("A" or "A, B"), or undefined when it has none. @param {any} item */
function typeName(item) {
  if (!item || typeof item !== 'object') return undefined;
  const type = item['@type'];
  if (typeof type === 'string' && type) return type;
  if (Array.isArray(type) && type.length > 0 && type.every((t) => typeof t === 'string' && t)) return type.join(', ');
  return undefined;
}

/**
 * @param {string | import('./html-lib.mjs').Node} page the page text, or a document parsed once by the caller
 * @returns {{ blocks: unknown[], problems: string[] }}
 */
export function structuredData(page) {
  const blocks = [];
  const problems = [];
  const scripts = [...elements(toDocument(page))]
    .filter((el) => el.tagName === 'script' && (attr(el, 'type') ?? '').trim().toLowerCase() === 'application/ld+json');
  for (const script of scripts) {
    let data;
    try {
      data = JSON.parse(text(script));
    } catch {
      problems.push('a structured-data block is not valid JSON');
      continue;
    }
    blocks.push(data);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      problems.push('a structured-data block is not an object');
      continue;
    }
    if (data['@context'] !== 'https://schema.org') problems.push(`structured data without "@context": "https://schema.org"`);
    // A type is a name or a list of names. A block holding an @graph has its types on the graph's items instead:
    // the graph must hold items, and each item needs its own type, unless it only points at another item by @id.
    if (Array.isArray(data['@graph'])) {
      if (data['@graph'].length === 0) problems.push('structured data with an empty "@graph"');
      data['@graph'].forEach((item, i) => {
        if (!typeName(item) && !isReference(item)) problems.push(`structured data: item ${i + 1} of the "@graph" has no "@type"`);
      });
    } else if (!typeName(data)) problems.push('structured data without a "@type"');
    // Each address is reported with the type of the item that holds it.
    const visit = (v, key, owner) => {
      if (Array.isArray(v)) return v.forEach((x) => visit(x, key, owner));
      if (v && typeof v === 'object') {
        const here = typeName(v) ?? owner;
        return Object.entries(v).forEach(([k, x]) => visit(x, k, here));
      }
      if (URL_KEYS.has(key) && typeof v === 'string' && !/^https:\/\/[^/\s]+\.[^/\s]+/.test(v)) {
        problems.push(`structured data ${owner ?? '(no type)'}: "${key}" is not a full https address: ${v}`);
      }
    };
    visit(data, '', undefined);
  }
  return { blocks, problems };
}

/** The expected types a page's blocks do not include. @param {unknown[]} blocks @param {string[]} types */
export function missingTypes(blocks, types) {
  const present = new Set();
  /** A block's own types (a string or a list) and those of the items of an @graph. @param {any} node */
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(collect);
    for (const t of [node['@type']].flat()) if (typeof t === 'string') present.add(t);
    if (Array.isArray(node['@graph'])) node['@graph'].forEach(collect);
  };
  blocks.forEach(collect);
  return types.filter((t) => !present.has(t));
}
