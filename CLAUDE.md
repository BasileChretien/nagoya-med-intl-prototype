# nagoya-med-intl-prototype

Astro 7 static site: bilingual (en/ja) prototype replacing the seven international websites of Nagoya University Graduate School of Medicine. Deployed to GitHub Pages under the base path `/nagoya-med-intl-prototype`; `SITE_URL` and `BASE_PATH` build it for another host, such as the faculty server (`src/lib/address.mjs`, `docs/launch.md`). Not an official site: it must keep the prototype banner and `noindex` (`PROTOTYPE` in `src/lib/launch.mjs` stays true until launch; steps in `docs/launch.md`).

## Commands

- `npm run dev` / `npm run build` (Astro, then the Pagefind search index in `dist/pagefind`) / `npm run preview`
- `npm run check` — content checks (pairing, deadlines, images, references) and staleness checks (`scripts/check-staleness.mjs`); `node scripts/check-content.mjs --dist` after a build also checks internal links
- `npm test` — tests of the checks themselves (`scripts/test-checks.mjs`, `scripts/test-staleness.mjs`, `scripts/test-content-plugin.mjs`, `scripts/test-tools.mjs`, `scripts/test-editor.mjs`); add a case when a check gains a rule
- `npm run sync -- status | confirm <key> | stamp-report <id> | prune` — record that both languages are in step (`content-sync.json`)
- `npm run faculty-texts` — regenerate `faculty/*.md`; `npm run check:faculty` — compare the live faculty pages with the site
- `node scripts/draw-features.mjs` — redraws `docs/features.md` from the feature map `docs/features.yaml`
- `npm run weekly-check` (after a build) — outside links and content checks, as the Monday workflow runs them; it makes real requests

## Layout

- `src/content/pages/{en,ja}/<section>/<slug>.md` — prose pages; same path in both languages
- `src/data/programmes/<id>.json`, `src/data/{contacts,partners,news,stories,images}.json` — facts, stored once; `src/data/faculty.json` — faculty page addresses and live-check rules
- `src/content.config.ts` — schemas (zod from `astro/zod`, loaders from `astro/loaders`)
- `src/pages/[lang]/[...slug].astro` — renders every content page and its generated blocks
- `src/i18n/ui.ts` — interface text in both languages; `src/lib/site.ts` — path and collection helpers

## Rules

- Write every link with `href(lang, path)` from `src/lib/site.ts`; never hardcode the base path.
- A page added in one language is added in the other in the same change, or the check fails.
- Do not retype a fact that a data file holds (deadline, capacity, staff title, email): show it from the data.
- Content rules and the Japanese style rules (yomiyasu) are in `CONTENT_GUIDE.md`.
- Photos from the official sites are reused with the department's authorisation. Every photo under `public/img/` (except the decorative campus photo behind the home title) is listed in `src/data/images.json` with a description in both languages (`alt.en`, `alt.ja`) and its real pixel sizes (`width`/`height`, plus `thumbWidth`/`thumbHeight` for a thumbnail), or the check fails. No personal emails.
- Student reports: originals in `src/data/reports/original/`, automatic translations in `src/data/reports/translated/` (`"method": "machine"`, same number of paragraphs, `sourceFingerprint` of the original). Never present a translation as the original.
- Change both languages together, then `npm run sync -- confirm <key>`; never confirm without checking both say the same thing.
- The office edits in the editing page, Sveltia CMS (`public/admin/config.yml`, `docs/editor-setup.md`), served only on GitHub Pages (server builds leave `admin/` out); when a data file's fields change, change `config.yml` in the same change. Saves start with `[editor]` and are confirmed by `scripts/editor-confirm.mjs` in `deploy.yml`.
- Two layers: team, research and publications live only in the faculty's directory entry; this site links to it. `faculty/*.md` are generated, never edited by hand.
- `/intlexch/japanese/alumni/` (Frontier-kai members' area, password-protected) lives on the faculty server, not here: never delete, move or redirect it; listed in `src/data/protected-areas.json`, rules in `docs/launch.md`.
- Source material for content lives outside this repo, in `../data/crawl/` (saved official pages) and `../report/issues.json` (audit findings). Photos are prepared with `../tools/photos.py` (collect, download, sheets, publish).
