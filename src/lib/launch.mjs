/**
 * The launch switch. While PROTOTYPE is true, every page carries `noindex` (search engines leave it out) and
 * robots.txt names no sitemap. At launch, set it to false together with the steps in docs/launch.md: the new
 * `site` and `base` in astro.config.mjs, the redirect map, and the banner text.
 * Read by src/layouts/Base.astro, src/pages/index.astro, src/pages/robots.txt.ts and scripts/check-content.mjs.
 */
export const PROTOTYPE = true;
