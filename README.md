# International website prototype

**Prototype for internal review. This is not an official Nagoya University website.**

A working prototype of one bilingual (English and Japanese) website for the international activities of Nagoya University Graduate School of Medicine. It shows what could replace the seven separate sites that exist today (the exchange sites under `/intlexch/`, the JDP site, the faculty's International section and related pages). The content was taken from those official sites on 25 November 2026 and reorganised by what visitors want to do.

Live prototype: https://basilechretien.github.io/nagoya-med-intl-prototype/

## What it demonstrates

- **One site, organised by audience**: Study in Nagoya, Study abroad, Joint & double degrees, Partnerships, About us.
- **Every fact stored once**: programmes, deadlines, staff, partners and contacts live in data files (`src/data/`) and appear wherever they are needed, in both languages.
- **Paired languages**: every page exists in English and Japanese, linked to each other.
- **A searchable library of student stories** built from the reports already published.
- **Honest status**: facts that the old sites contradict are listed on each page and on the *Content status* page, for the office to confirm.
- **Automatic checks** on every change (`scripts/check-content.mjs`): missing translations, passed deadlines shown as open, oversized images, broken internal links.
- **Light and fast**: static pages, system fonts plus one small web font, images under 300 KB.

The prototype is hidden from search engines (`noindex`) so that it never competes with the official sites.

## Edit the content

Read [CONTENT_GUIDE.md](CONTENT_GUIDE.md). In short:

- A page is a Markdown file in `src/content/pages/en/...` with its twin in `src/content/pages/ja/...`.
- A programme is a JSON file in `src/data/programmes/`. Change a deadline there and every page that shows it updates.
- Staff, contacts, partners, news and stories are JSON files in `src/data/`.

## Run it locally

Requires Node.js 20 or later.

```bash
npm ci
npm run dev        # http://localhost:4321/nagoya-med-intl-prototype/
npm run check      # content checks
npm run build      # static site in dist/
node scripts/check-content.mjs --dist   # also checks every internal link of the build
```

Pushing to `main` runs the checks, builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).

## Moving to production

The site is plain HTML, CSS and a few lines of JavaScript. To serve it from `www.med.nagoya-u.ac.jp/intlexch/`, change `site` and `base` in `astro.config.mjs` (and `BASE` in `scripts/check-content.mjs`), remove the `noindex` meta tag and the prototype banner, build, and upload `dist/`. Old addresses should get permanent (301) redirects to their new pages.

## Rights

Texts and the campus photograph come from the official websites of Nagoya University Graduate School of Medicine and remain the university's. No photographs of people are reused. Student stories show a short excerpt and link to the full report on the official site.
