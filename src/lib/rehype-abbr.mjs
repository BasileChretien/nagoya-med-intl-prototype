/**
 * Two jobs on content pages (src/content/pages/<lang>/...):
 *
 * 1. Site links. Markdown links are written relative to the file, as CONTENT_GUIDE says: [Contact](../about/contact)
 *    in en/degrees/adelaide.md means /en/about/contact/. Pages are served at /en/degrees/adelaide/, from where a
 *    browser would read the same href one level too deep, so every relative link is rewritten to its full address
 *    (which the --dist link check then verifies).
 *
 * 2. Acronyms, from src/data/glossary.json:
 *   - the first use of each acronym on a page becomes <abbr title="what it stands for">;
 *   - an "Abbreviations on this page" box at the end lists them, with the institution's website when it has one,
 *     and links to the full list (about/glossary). Common terms (UK, PDF...) get the title but stay out of the box.
 * The page language comes from the file path (src/content/pages/<lang>/...).
 *
 * A hast plugin for Sätteri, Astro's Markdown processor:
 *   markdown: { processor: satteri({ hastPlugins: [abbrPlugin({ base })] }) }
 */
import { readFileSync } from 'node:fs';

const GLOSSARY_FILE = new URL('../data/glossary.json', import.meta.url);
const SKIP = new Set(['abbr', 'code', 'pre', 'script', 'style']);
const TEXT = {
  en: { heading: 'Abbreviations on this page', website: 'website', all: 'All abbreviations', unconfirmed: 'to be confirmed' },
  ja: { heading: 'このページの略語', website: '公式サイト', all: '略語の一覧', unconfirmed: '確認中' },
};

/** @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @returns {{ terms: Map<string, any>, pattern: RegExp }} */
function loadGlossary() {
  const entries = JSON.parse(readFileSync(GLOSSARY_FILE, 'utf8'));
  const terms = new Map(entries.map((e) => [e.term, e]));
  const alternatives = [...terms.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  // Whole words only: not part of a longer word or code ("US" in "USMLE", "AI" in "MAIL").
  return { terms, pattern: new RegExp(`(?<![A-Za-z0-9])(${alternatives})(?![A-Za-z0-9])`, 'g') };
}

const el = (tagName, properties, children) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });

/** @param {{ base?: string }} [options] */
export default function abbrPlugin(options = {}) {
  const base = (options.base ?? '').replace(/\/$/, '');
  // The factory runs once per document, so `seen` is per page.
  return (factory) => {
    const { terms, pattern } = loadGlossary();
    const path = decodeURIComponent(factory.fileURL?.pathname ?? '');
    const lang = /\/pages\/ja\//.test(path) ? 'ja' : 'en';
    // The page's folder within the site ("en/degrees/"), against which its relative links are read.
    const folder = (path.split('/pages/')[1] ?? `${lang}/`).replace(/[^/]*$/, '');
    const seen = [];
    const t = TEXT[lang];

    return {
      name: 'abbr',
      element: {
        filter: ['a'],
        visit(node, ctx) {
          const href = node.properties?.href;
          if (typeof href !== 'string' || !href || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return;
          const url = new URL(href, `https://site${base}/${folder}`);
          // "index" is the section's own page: degrees/index is /degrees/.
          const clean = url.pathname.replace(/\/index\/?$/, '/');
          const pathname = /\.[a-z0-9]+$/i.test(clean) || clean.endsWith('/') ? clean : `${clean}/`;
          ctx.setProperty(node, 'href', pathname + url.search + url.hash);
        },
      },
      text(node, ctx) {
        for (let p = ctx.parent(node); p && p.type !== 'root'; p = ctx.parent(p)) {
          if (p.type === 'element' && SKIP.has(p.tagName)) return;
        }
        const pieces = [];
        let last = 0;
        for (const m of node.value.matchAll(pattern)) {
          const term = m[1];
          if (seen.includes(term)) continue;
          seen.push(term);
          if (m.index > last) pieces.push(text(node.value.slice(last, m.index)));
          pieces.push(el('abbr', { title: terms.get(term)[lang] }, [text(term)]));
          last = m.index + term.length;
        }
        if (!pieces.length) return;
        if (last < node.value.length) pieces.push(text(node.value.slice(last)));
        ctx.replaceNode(node, pieces);
      },
      after(root, ctx) {
        const listed = seen.map((term) => terms.get(term)).filter((e) => !e.common);
        if (!listed.length) return;
        const items = listed.map((e) => el('div', {}, [
          el('dt', {}, [el('abbr', { title: e[lang] }, [text(e.term)])]),
          el('dd', {}, [
            text(e[lang]),
            ...(e.confirmed === false ? [text(` (${t.unconfirmed})`)] : []),
            ...(e.url ? [text(' · '), el('a', { href: e.url[lang] ?? e.url.en, rel: ['noopener'] }, [text(t.website)])] : []),
          ]),
        ]));
        ctx.appendChild(root, el('aside', { className: ['abbrevs'], ariaLabelledBy: 'abbrevs-heading' }, [
          el('h2', { id: 'abbrevs-heading' }, [text(t.heading)]),
          el('dl', {}, items),
          el('p', {}, [el('a', { href: `${base}/${lang}/about/glossary/` }, [text(t.all)])]),
        ]));
      },
    };
  };
}
