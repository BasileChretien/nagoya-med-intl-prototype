# Launch checklist

What changes when the prototype becomes the official site at `www.med.nagoya-u.ac.jp/intlexch/`. The items marked
"office" or "faculty IT" are decisions this repository cannot make.

## In this repository

1. `astro.config.mjs`: set `site` to `https://www.med.nagoya-u.ac.jp` and `base` to `/intlexch`. Change `BASE` in
   `scripts/check-content.mjs` to match.
2. `src/lib/launch.mjs`: set `PROTOTYPE` to `false`. This removes the `noindex` tag from every page and adds the
   sitemap line to `robots.txt`.
3. Remove the prototype banner and the prototype note in the footer (`protoLead`, `protoText`, `footerAbout` in
   `src/i18n/ui.ts`, used by `src/components/Header.astro` and `src/components/Footer.astro`), and the prototype
   wording on the front page (`src/pages/index.astro`).
4. Replace the prototype descriptions on `about/privacy` and `about/accessibility` with the statements agreed below,
   in both languages, and confirm them (`npm run sync -- confirm about/privacy`).
5. Build, run `npm run check` and `node scripts/check-content.mjs --dist`, and deploy.

## With faculty IT

- **Redirects.** Every old address listed in the audit's redirect map must lead to its new page.
- **robots.txt.** Search engines read `robots.txt` only at the root of a host, so the site's own file does not count
  under `/intlexch/`. Ask faculty IT to add this line to the faculty's `https://www.med.nagoya-u.ac.jp/robots.txt`,
  and to check that nothing there blocks `/intlexch/`:

  ```
  Sitemap: https://www.med.nagoya-u.ac.jp/intlexch/sitemap-index.xml
  ```

- **Search Console.** Submit the same sitemap address in Google Search Console for the faculty's property, and in
  Bing Webmaster Tools if the faculty uses it.
- **Hosting and logs.** Where the site is served from, who keeps the server logs and for how long. The privacy page
  must say so.

## With the office (and the faculty)

- **Measuring results.** Whether visits are measured, and with what. The faculty already uses Google Analytics on
  its own pages. A tool that sets no cookies needs no consent banner; Google Analytics needs the consent the
  university requires. Decide what to measure before choosing the tool: for example enquiries per month by
  audience, visits to programme pages, and the share of visitors who reach a contact. Update the privacy page
  before switching anything on. Nothing in the site measures visits today.
- **Accessibility target.** The accessibility page proposes WCAG 2.2 at level AA. Japanese public sites often state
  their target against JIS X 8341-3:2016. Agree the target and a test with people who use assistive technology.
- **Events in search results.** Search engines show events only with a place. The news data has no place field, so
  events are not described as events yet. Add a `place` to `src/data/news.json` items and an `Event` builder to
  `src/lib/structured.ts` if the office wants them shown.

## Already in place

- Language links between the two versions of each page, canonical addresses and sharing previews (`src/layouts/Base.astro`).
- The sitemap with both languages (`@astrojs/sitemap` in `astro.config.mjs`), built on every deploy.
- Structured data for the office, the breadcrumb trail and each programme (`src/lib/structured.ts`), checked after
  every build by `scripts/check-content.mjs --dist`.
- The weekly check of outside links and deadlines (`.github/workflows/weekly-check.yml`) and the monthly tool
  updates (`.github/dependabot.yml`). In the repository's settings, turn on Dependabot alerts and security updates
  too: they are not set by `dependabot.yml`.
