// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import abbrPlugin from './src/lib/rehype-abbr.mjs';

const base = '/nagoya-med-intl-prototype';

// Served from GitHub Pages as a project site: https://basilechretien.github.io/nagoya-med-intl-prototype/
// For production at www.med.nagoya-u.ac.jp/intlexch/, change `site` and `base` only.
export default defineConfig({
  site: 'https://basilechretien.github.io',
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Acronyms on content pages: first use explained, list at the end of each page (src/data/glossary.json).
  markdown: { processor: satteri({ hastPlugins: [abbrPlugin({ base })] }) },
});
