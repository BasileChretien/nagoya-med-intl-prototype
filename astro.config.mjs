// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import abbrPlugin from './src/lib/rehype-abbr.mjs';
import { SITE, BASE } from './src/lib/address.mjs';

// Served from GitHub Pages as a project site by default: https://basilechretien.github.io/nagoya-med-intl-prototype/
// For the faculty server, build with SITE_URL and BASE_PATH set (src/lib/address.mjs, docs/launch.md "Hosting"):
// no file changes.
const site = SITE;
const base = BASE;
export default defineConfig({
  site,
  base: base || '/',
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
