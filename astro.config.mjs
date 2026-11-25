// @ts-check
import { defineConfig } from 'astro/config';

// Served from GitHub Pages as a project site: https://basilechretien.github.io/nagoya-med-intl-prototype/
// For production at www.med.nagoya-u.ac.jp/intlexch/, change `site` and `base` only.
export default defineConfig({
  site: 'https://basilechretien.github.io',
  base: '/nagoya-med-intl-prototype',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
