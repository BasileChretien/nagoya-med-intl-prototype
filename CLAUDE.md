# nagoya-med-intl-prototype

Astro 7 static site: bilingual (en/ja) prototype replacing the seven international websites of Nagoya University Graduate School of Medicine. Deployed to GitHub Pages under the base path `/nagoya-med-intl-prototype`. Not an official site: it must keep the prototype banner and `noindex`.

## Commands

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run check` — content checks (pairing, deadlines, images, references); `node scripts/check-content.mjs --dist` after a build also checks internal links
- `node scripts/draw-features.mjs` — redraws `docs/features.md` from the feature map `docs/features.yaml`

## Layout

- `src/content/pages/{en,ja}/<section>/<slug>.md` — prose pages; same path in both languages
- `src/data/programmes/<id>.json`, `src/data/{staff,contacts,partners,news,stories}.json` — facts, stored once
- `src/content.config.ts` — schemas (zod from `astro/zod`, loaders from `astro/loaders`)
- `src/pages/[lang]/[...slug].astro` — renders every content page and its generated blocks
- `src/i18n/ui.ts` — interface text in both languages; `src/lib/site.ts` — path and collection helpers

## Rules

- Write every link with `href(lang, path)` from `src/lib/site.ts`; never hardcode the base path.
- A page added in one language is added in the other in the same change, or the check fails.
- Do not retype a fact that a data file holds (deadline, capacity, staff title, email): show it from the data.
- Content rules and the Japanese style rules (yomiyasu) are in `CONTENT_GUIDE.md`.
- Photos from the official sites are reused with the department's authorisation. Every photo under `public/img/` (except the decorative campus photo behind the home title) is listed in `src/data/images.json` with a description in both languages (`alt.en`, `alt.ja`), or the check fails. No personal emails.
- Student reports: originals in `src/data/reports/original/`, automatic translations in `src/data/reports/translated/` (`"method": "machine"`, same number of paragraphs). Never present a translation as the original.
- Source material for content lives outside this repo, in `../data/crawl/` (saved official pages) and `../report/issues.json` (audit findings). Photos are prepared with `../tools/photos.py` (collect, download, sheets, publish).
