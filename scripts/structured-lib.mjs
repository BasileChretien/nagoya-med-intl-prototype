/**
 * Checks the structured data (JSON-LD) in a built page: each block parses, names schema.org and a type, and every
 * address in it is a full https address; `missingTypes` says which expected types a page lacks (the office on the
 * home pages, the breadcrumb trail on content pages), so that blocks that disappear are noticed too.
 * Used by scripts/check-content.mjs --dist; tested by scripts/test-tools.mjs.
 */

// Any attribute order, and other attributes beside the type.
const BLOCK = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const URL_KEYS = new Set(['url', 'item', '@id', 'sameAs', 'logo', 'image']);

/** @param {string} html @returns {{ blocks: unknown[], problems: string[] }} */
export function structuredData(html) {
  const blocks = [];
  const problems = [];
  for (const m of html.matchAll(BLOCK)) {
    let data;
    try {
      data = JSON.parse(m[1]);
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
    // A type is a name or a list of names; a block holding an @graph has its types on the graph's items.
    const type = data['@type'];
    const typed = (typeof type === 'string' && type !== '') || (Array.isArray(type) && type.length > 0 && type.every((t) => typeof t === 'string' && t));
    if (!typed && !Array.isArray(data['@graph'])) problems.push('structured data without a "@type"');
    const visit = (v, key) => {
      if (Array.isArray(v)) return v.forEach((x) => visit(x, key));
      if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => visit(x, k));
      if (URL_KEYS.has(key) && typeof v === 'string' && !/^https:\/\/[^/\s]+\.[^/\s]+/.test(v)) {
        problems.push(`structured data ${data['@type']}: "${key}" is not a full https address: ${v}`);
      }
    };
    visit(data, '');
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
