/**
 * Checks the structured data (JSON-LD) in a built page: each block parses, names schema.org and a type, and every
 * address in it is a full https address. Used by scripts/check-content.mjs --dist; tested by scripts/test-tools.mjs.
 */

const BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
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
    if (typeof data['@type'] !== 'string' || !data['@type']) problems.push('structured data without a "@type"');
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
