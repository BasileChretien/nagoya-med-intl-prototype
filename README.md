# International website prototype

**Prototype for internal review. This is not an official Nagoya University website.**

A working prototype of one bilingual (English and Japanese) website for the international activities of Nagoya University Graduate School of Medicine. It shows what could replace the seven separate sites that exist today (the exchange sites under `/intlexch/`, the JDP site, the faculty's International section and related pages). The content was taken from those official sites on 25 November 2026 and reorganised by what visitors want to do.

Live prototype: https://basilechretien.github.io/nagoya-med-intl-prototype/

## What it demonstrates

- **One site, organised by audience**: Study in Nagoya, Study abroad, Joint & double degrees, Partnerships, About us.
- **Every fact stored once**: programmes, deadlines, partners and contacts live in data files (`src/data/`) and appear wherever they are needed, in both languages.
- **Paired languages**: every page exists in English and Japanese, linked to each other.
- **A searchable library of student stories** built from the reports already published, with a page for every report in both languages. The version that is not the original is an automatic (AI) translation and says so.
- **Photos with descriptions**: every photo has a text description in English and Japanese for screen readers.
- **Honest status**: facts that the old sites contradict are listed on each page and on the *Content status* page, for the office to confirm.
- **Automatic checks** on every change (`scripts/check-content.mjs`): missing translations, passed deadlines shown as open, oversized images, broken internal links.
- **No version goes stale** (`scripts/check-staleness.mjs`): a page, fact, photo description or report translation changed in one language without the other fails the check, and facts must give the same numbers in both languages.
- **Two layers, like the rest of the faculty**: team, research and publications stay in the faculty's laboratory directory entry; this site holds what changes. The texts for the faculty's own pages are generated from the site's data (`faculty/`), and a weekly job compares the live faculty pages with the site.
- **Light and fast**: static pages, system fonts plus one small web font, images under 300 KB.

The prototype is hidden from search engines (`noindex`) so that it never competes with the official sites.

## Edit the content

You do not need to be a programmer. Small changes can be made in the browser on github.com, with nothing to install: open the file, click the pencil, and save the change as a pull request. The checks run on every pull request and say what is wrong, if anything.

Start with [Your first edit](CONTENT_GUIDE.md#your-first-edit) in the content guide. It walks through four tasks step by step:

- change a deadline;
- add a news item;
- fix a typo in a Japanese page;
- add a student report with a photo.

In short:

- A page is a Markdown file in `src/content/pages/en/...` with its twin in `src/content/pages/ja/...`.
- A programme is a JSON file in `src/data/programmes/`. Change a deadline there and every page that shows it updates. The [programme index](docs/data-files.md#programme-ids) lists every programme id with its name and page.
- Contacts, partners, news, stories and photos are JSON files in `src/data/`. [docs/data-files.md](docs/data-files.md) gives one complete example of each and the values each field accepts.
- After a change in one language, the check asks you to confirm that both languages say the same thing. The table [Which command when](CONTENT_GUIDE.md#5-keeping-every-version-in-step) says which command to run. A typo fixed in one language only may be confirmed once you have checked that the other language needs no fix.

Every change is reviewed in its pull request, published when it is merged, and undone with GitHub's "Revert" button: see [Publishing, review and undo](CONTENT_GUIDE.md#publishing-review-and-undo). For help, open an issue in the repository.

## Run it locally

Requires Node.js 22.23.4 or later (Astro's minimum; the GitHub workflows use Node.js 22).

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

Texts and photographs come from the official websites of Nagoya University Graduate School of Medicine, are reused with the department's authorisation, and remain the university's. Each report page links to the report on the official site. Translations of student reports are automatic and labelled as such.
