/**
 * Two jobs on content pages (src/content/pages/<lang>/...):
 *
 * 1. Site links. Markdown links are written relative to the file, as CONTENT_GUIDE says: [Contact](../about/contact)
 *    in en/degrees/adelaide.md means /en/about/contact/. Pages are served at /en/degrees/adelaide/, from where a
 *    browser would read the same href one level too deep, so every relative link is rewritten to its full address
 *    (which the --dist link check then verifies).
 *
 *    A link to a page in the other language, or to a PDF, says so after its text: "(Japanese)", "（英語）", "(PDF)".
 *    A PDF only says "PDF": its folder does not tell its language. An address that cannot be read is left alone.
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
import { urlLang } from './url-lang.mjs';

const GLOSSARY_FILE = new URL('../data/glossary.json', import.meta.url);
const SKIP = new Set(['abbr', 'code', 'pre', 'script', 'style']);
const TEXT = {
  en: { heading: 'Abbreviations on this page', website: 'website', all: 'All abbreviations', unconfirmed: 'to be confirmed',
    other: 'Japanese', pdf: 'PDF', open: ' (', sep: ', ', close: ')' },
  ja: { heading: 'このページの略語', website: '公式サイト', all: '略語の一覧', unconfirmed: '確認中',
    other: '英語', pdf: 'PDF', open: '（', sep: '、', close: '）' },
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
          if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
            // Say when the target is in the other language or is a PDF, unless the link text, or the words right after
            // the link ("(in Japanese)", ", which is in Japanese", "(PDF, 447 KB)", "（英語）"), already do.
            const parent = ctx.parent(node);
            const next = parent?.children?.[(ctx.indexOf(node) ?? -1) + 1];
            const after = next?.type === 'text' ? next.value.slice(0, 40) : '';
            const said = ctx.textContent(node) + (/^[^.。]{0,25}?(in (Japanese|English)|日本語|英語)/i.test(after) ? ' Japanese' : '') + (/^\s*[(（]\s*PDF/i.test(after) ? ' PDF' : '');
            let pathname;
            try { pathname = new URL(href).pathname; } catch { return; } // an address that cannot be read is left as written
            // A PDF's folder does not tell its language (English templates sit under /medical_J/), so it only says "PDF".
            const pdf = /\.pdf$/i.test(pathname);
            const target = pdf ? null : urlLang(href);
            const labels = [];
            if (target && target !== lang && !/(Japanese|English|日本語|英語)/i.test(said)) labels.push(t.other);
            if (pdf && !/PDF/i.test(said)) labels.push(t.pdf);
            if (target && target !== lang) ctx.setProperty(node, 'hrefLang', target);
            if (labels.length) ctx.appendChild(node, text(`${t.open}${labels.join(t.sep)}${t.close}`));
            return;
          }
          if (typeof href !== 'string' || !href || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return;
          let url;
          try { url = new URL(href, `https://site${base}/${folder}`); } catch { return; }
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
