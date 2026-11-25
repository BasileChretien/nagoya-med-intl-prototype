// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import abbrPlugin from './src/lib/rehype-abbr.mjs';

const base = '/nagoya-med-intl-prototype';
const site = 'https://basilechretien.github.io';

// Served from GitHub Pages as a project site: https://basilechretien.github.io/nagoya-med-intl-prototype/
// For production at www.med.nagoya-u.ac.jp/intlexch/, change `site` and `base` here and follow docs/launch.md.
export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Acronyms on content pages: first use explained, list at the end of each page (src/data/glossary.json).
  markdown: { processor: satteri({ hastPlugins: [abbrPlugin({ base })] }) },
  // sitemap-index.xml, with each page's other language. Left out: the language chooser at the root (it only
  // redirects), the office's checklist pages and the 404 page. Search engines are told about it at launch
  // (src/lib/launch.mjs, docs/launch.md).
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'en', locales: { en: 'en', ja: 'ja' } },
      filter: (page) => page !== `${site}${base}/` && !/\/(en|ja)\/status\/$/.test(page) && !/\/404\/?$/.test(page),
    }),
  ],
});
