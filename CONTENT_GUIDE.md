# Content guide

How content is stored and written in this site. Read it before adding or changing a page. If you have never edited the site, start with "Your first edit" below. The fields and allowed values of every data file are in [docs/data-files.md](docs/data-files.md), with the list of programme ids.

## Start here

### Three ways to edit

**In the browser, with nothing to install.** Open the repository on github.com, open the file, and click the pencil ("Edit this file"). When you are done, click "Commit changes", choose "Create a new branch for this commit and start a pull request", and create the pull request. GitHub explains the steps in [Editing files](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files). To change several files in one go (a report and its photo, for example), press `.` on the repository page: it opens the [github.dev editor](https://docs.github.com/en/codespaces/the-githubdev-web-based-editor) in the browser.

The browser editors cannot run commands, and they do not need to. The checks run on every pull request, and a red check lists what is wrong. When it says two languages are out of step, finish in the browser as well:

1. Read the English and the Japanese once more and make sure they say the same thing.
2. In the repository, open the **Actions** tab, choose **Confirm both languages**, and click **Run workflow**.
3. Under "Use workflow from", choose your branch (the one your pull request was created on; the workflow refuses `main`), paste the keys the check printed (for example `study-in-nagoya/faq programmes/sep-unc.json#duration`, separated by spaces), add the story ids if you updated a report translation, tick "I have read both languages", and run it.
4. The workflow records the confirmation, regenerates the faculty texts, commits to your branch and runs the checks. GitHub does not start the pull request's own checks again for a commit made by a workflow, so the pull request shows none for that commit: the workflow's run is the check. When it is green, merge the pull request.

The workflow will not run unless the box is ticked: confirming is a statement that both languages say the same thing, never a way to silence the check. A [codespace](https://docs.github.com/en/codespaces/about-codespaces/what-are-codespaces), the same editor with a terminal, also works.

**On your computer.** Install Node.js 22.23.4 or later (the site's build on GitHub uses Node.js 22), run `npm ci` once in the project folder, then `npm run dev` to see the site at `http://localhost:4321/nagoya-med-intl-prototype/` while you edit. Run `npm run check` before you commit.

**With a content editor, later.** [Pages CMS](https://pagescms.org/) and [Decap CMS](https://decapcms.org/) are free editors that work on top of a GitHub repository. They show forms instead of files, and every save becomes a commit, so the checks and the pull request review stay as they are. Neither is installed. Setting one up means writing a configuration file that describes the pages and the data files; the `confirm` step then runs from the Actions tab as above. Decide this once the office knows who will edit the site and how often.

### Your first edit

Each task below ends with `npm run check`. When the check prints an error, it also prints the command that fixes it.

**Change a deadline**

1. Find the programme's id in the [programme index](docs/data-files.md#programme-ids). Open `src/data/programmes/<id>.json`.
2. Find `"deadline"`. Change `status`, `date` and `text`, following the deadline rules in section 4. Write the text in both languages. For a dated deadline:

   ```json
   "deadline": {
     "status": "open",
     "date": "YYYY-MM-DD",
     "text": { "en": "Applications until <date in words>", "ja": "<日付>まで受け付けます" }
   }
   ```

3. Add the official page that gives the new date to `sources`, and remove the `toConfirm` line it answers.
4. Run `npm run check`. It reports `programmes/<id>.json#deadline/text: both languages changed since last confirmed`. Read the two texts once more, then run `npm run sync -- confirm programmes/<id>.json#deadline/text`.
5. Every page that shows this programme now shows the new deadline. Do not type the date into any page.

**Add a news item**

1. Open `src/data/news.json`. Copy an existing item, paste it after the opening `[`, and add a comma after its closing `}`.
2. Change every field: a new `id`, the `date`, the `category`, the `title` and `summary` in both languages, the `url` and the `sources`. The allowed values are in [docs/data-files.md](docs/data-files.md#newsjson).
3. Run `npm run check`, then `npm run sync -- confirm news.json#<id>`.

**Fix a typo in a Japanese page**

1. Open `src/content/pages/ja/<section>/<slug>.md`. The path is the page's address after `/ja/`.
2. Fix the typo. Open the English page at the same path under `en/` and check that it does not have the same mistake.
3. Run `npm run check`. It reports `en/<slug> is stale`, because only the Japanese file changed. A typo, spacing or punctuation fix does not change what the page says. When the English page needs no change, the two still say the same thing, so you may confirm: `npm run sync -- confirm <section>/<slug>`.
4. Check the Japanese style (section 9).

**Add a student report with a photo**

1. Choose an id that follows the ones in use, for example `clerkship-<year>-report<n>` or `research-<year>-<full-name>` (the list is in [docs/data-files.md](docs/data-files.md#storiesjson)), and check that it is not taken in `src/data/stories.json`.
2. Add the story to `src/data/stories.json` (fields in [docs/data-files.md](docs/data-files.md#storiesjson)). `source` is the address of the report on the official site.
3. Save the student's text as `src/data/reports/original/<id>.json`, and an automatic translation into the other language as `src/data/reports/translated/<id>.json`, one paragraph for each paragraph (section 8).
4. Save the photo as WebP under 300 KB, and a smaller copy as its thumbnail, in `public/img/stories/` as `<id>-1.webp` and `<id>-1-t.webp`. Any image editor that saves WebP will do; the free web tool [Squoosh](https://squoosh.app/) works in the browser.
5. Add the photo to `src/data/images.json` with `"id": "<id>-1"`, `"kind": "story"`, `"story": "<id>"`, the two file paths and a description in both languages (section 7). If you do not know the pixel sizes, enter any numbers: the check names the real ones.
6. Run `npm run check`, then `npm run sync -- stamp-report <id>` and `npm run sync -- confirm images.json#<id>-1`.

### Publishing, review and undo

- **Review.** Every change goes through a pull request. A second person reads it before it is merged: both languages, the sources, and the `toConfirm` lines added or removed. The checks run on every pull request; do not merge while one is red.
- **Publishing.** Merging into `main` runs the checks again, builds the site and publishes it (`.github/workflows/deploy.yml`). The "Actions" tab of the repository shows when it has finished. If a check fails there, nothing is published and the previous version stays online.
- **Undo.** Open the merged pull request and click "Revert". GitHub opens a new pull request that takes the change out; merge it like any other ([Reverting a pull request](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/reverting-a-pull-request)).
- **Help.** Open an issue in the repository with the page or file, what you changed and the message the check printed. The technical contact answers these issues.

## 1. Where things live

| What | Where | One file per |
| --- | --- | --- |
| Prose pages | `src/content/pages/en/<section>/<slug>.md` and `src/content/pages/ja/<section>/<slug>.md` | page and language |
| Programme facts | `src/data/programmes/<id>.json` | programme |
| Contact points | `src/data/contacts.json` | all contacts |
| Partner universities | `src/data/partners.json` | all partners |
| News and events | `src/data/news.json` | all items |
| Student stories | `src/data/stories.json`, with the full texts in `src/data/reports/` | all stories |
| Photos | `src/data/images.json`, with the files in `public/img/` | all photos |
| Faculty pages and their checks | `src/data/faculty.json` | the whole faculty layer |

A fact is stored once. A page never retypes a deadline, a capacity, a staff title or an email that is already in a data file: the layout shows it from the data. Prose explains; data states. The team (names, titles, research) lives in the faculty's laboratory directory entry, not in this site (section 6).

The English and Japanese files of a page have **the same path** after the language folder, so the site can link them. Every page must exist in both languages.

## 2. Sections and pages

| Section | Slugs |
| --- | --- |
| `study-in-nagoya` | `index`, `clinical-clerkship`, `research-training`, `living-in-nagoya`, `visiting-researchers`, `faq` |
| `study-abroad` | `index`, `clinical-electives`, `research-abroad`, `short-programmes`, `scholarships`, `medical-english`, `safety`, `usmle-and-certificates`, `faq` |
| `degrees` | `index`, `joint-degree`, `adelaide`, `lund`, `freiburg`, `cuhk-double-degree`, `unc-scholar-exchange`, `admission`, `faq` |
| `partnerships` | `index`, `game`, `mirai`, `agreements`, `symposia`, `visits`, `become-a-partner`, `coordinators`, `companies`, `for-faculty` |
| `about` | `index`, `contact`, `access`, `support`, `glossary` (team, research and publications live in the faculty's directory entry, linked from `about`) |

The folders under `src/content/pages/` are the final word on which pages exist.

Generated pages (no Markdown file): home, student stories, news, programme comparison, content status.

## 3. Page front matter

```yaml
---
title: Clinical clerkship in Nagoya          # page title, also the <title>
description: Who can come for a clinical clerkship, for how long, and how to apply.   # <= 160 characters, shown by search engines
section: study-in-nagoya
order: 10                                    # position in the section menu
summary: Four to twelve weeks in a Nagoya University Hospital department, for students of partner schools.   # one sentence for cards
status: verified                             # verified | to-confirm | draft-translation
toConfirm:                                   # facts the office must confirm before publication
  - Current application window for 2027 rotations
sources:                                     # official pages this content was taken from
  - https://www.med.nagoya-u.ac.jp/intlexch/english/abroad/overseas.html
updated: 2026-11-25                          # date the content was taken from the sources
programmes: [clinical-clerkship]             # programme ids whose fact box appears on the page
---
```

- `status: draft-translation` when the page was translated from the other language and no native speaker has checked it yet.
- `status: to-confirm` when any fact on the page conflicts between sources or may be out of date. List each one in `toConfirm`, in the page's language.
- A `toConfirm` item that contains a colon followed by a space must be in quotes (`- 'Two sources differ: ...'`), or YAML reads it as a key and the build fails.
- Link other pages of the site relative to the file, as you would between the Markdown files themselves: from `degrees/adelaide.md`, `[Admission](admission)` for a page of the same section, `[Contact](../about/contact)` for another section, and `[Degrees](index)` for the section's first page. The build turns each into the page's full address, and `node scripts/check-content.mjs --dist` fails on a link that leads nowhere.

## 4. Programme file (`src/data/programmes/<id>.json`)

The ids, names and pages of all programmes are listed in the [programme index](docs/data-files.md#programme-ids).

```json
{
  "section": "study-in-nagoya",
  "name": { "en": "Clinical clerkship for overseas students", "ja": "海外の医学生のための臨床実習" },
  "short": { "en": "Clinical clerkship", "ja": "臨床実習" },
  "audience": { "en": "Final-year medical students of partner schools", "ja": "協定校の医学部最終学年の学生" },
  "duration": { "en": "4 to 12 weeks", "ja": "4〜12週間" },
  "capacity": { "en": "About 40 students a year", "ja": "年間約40名" },
  "cost": { "en": "Tuition waived for partner schools", "ja": "協定校の学生は授業料免除" },
  "funding": { "en": "...", "ja": "..." },
  "degree": { "en": "...", "ja": "..." },
  "eligibility": { "en": "...", "ja": "..." },
  "howToApply": { "en": "...", "ja": "..." },
  "deadline": { "status": "rolling", "text": { "en": "6 months before the start of the rotation", "ja": "実習開始の6か月前まで" } },
  "partners": ["adelaide"],
  "contact": "intl-office",
  "page": "study-in-nagoya/clinical-clerkship",
  "checked": "2026-11-25",
  "sources": ["https://..."],
  "toConfirm": ["..."]
}
```

Only `section`, `name`, `audience`, `contact`, `page` and `checked` are required. Leave a field out rather than guess.

**When the facts were checked.** `checked` is the day you last compared the facts with their sources (or the office confirmed them). The fact box shows it, with the number of `toConfirm` items still open; each page shows its `updated` date at the top in the same way. The date reads "Checked against the official pages" when the page or programme has a source on the university's sites and is not a draft translation, and "Last updated" otherwise. Change the date only after checking. `npm run check` warns when a programme or page was last checked more than a year ago, and the weekly check reports the warning. `section` is one of `study-in-nagoya`, `study-abroad` or `degrees`.

**Deadlines.** Never invent a date.
- A recurring rule from the sources ("6 months before the start") → `"status": "rolling"`.
- A dated deadline in the future → `"status": "open"` and `"date": "YYYY-MM-DD"`.
- Only past deadlines are known → `"status": "tba"`, text like "To be announced (last cycle: applications 6–15 January 2025)", and a `toConfirm` entry.

When an `open` deadline's date passes, the site shows it as closed from the next build (every deploy, and every Monday) and leaves it out of the calendars. `npm run check` warns, and the weekly check opens an issue, until you change it to `tba` as above.

A dated deadline (`open` or `rolling` with a `date` still to come) gets an "Add to calendar" link in its fact box, and it appears in the calendar file visitors can subscribe to (`/en/calendar.ics`, `/ja/calendar.ics`), with news events and calls whose day has not passed (an event's `date` to `until`; a call on its `until`, its deadline, and not at all without one). The news feed (`/en/news/rss.xml`, `/ja/news/rss.xml`) lists every news item. Both are built from the data on every deploy and every Monday: nothing to update by hand.

**Contact ids.** `intl-office` (Office of International Affairs, general) and `jdp-office` (joint degrees, the double degree and the scholar exchange with UNC). Others may be added to `contacts.json`.

## 5. Keeping every version in step

No version may fall behind another. `npm run check` fails when:

- an English or Japanese page changed without its counterpart, or a bilingual field (`{ "en", "ja" }` in `src/data/`) changed in one language only, or has only one of the two;
- a fact (programmes, contacts, partners) gives different numbers in its two languages. Numbers written differently count as the same: `1.5 million` and `150万`, `10 million` and `1千万`, `15,000` and `1万5千`, `1 billion` and `10億`, `20,000 to 30,000` and `2〜3万`, `20 to 30 million` and `2〜3千万`, `third-year` and `3年生`, `Apr` and `4月`. Kanji numerals count only before a counter or unit (`三千人`, `二百五十名`, `三千万円`): a bare `三千` is not read. "Thousands of" and `数千` state no number. The numbers 0 and 1 are not compared, because "a", "one", "single" and `1つ` are written in too many ways;
- a report translation was made from an older version of its original;
- the texts in `faculty/` no longer match what the data produces.

How to change something:

1. Change both languages (for a report, update the translation after the original).
2. Check that they say the same thing.
3. Record it: `npm run sync -- confirm <page slug or field key>` (for a report: `npm run sync -- stamp-report <id>`). The error message gives the exact command.
4. If a programme, contact or the About summary changed, run `npm run faculty-texts`. Once the new site is live at `/intlexch/`, send the changed files in `faculty/` to the faculty's web team. Before that, do not send them: their links use the new site's addresses, which do not exist yet.

`npm run sync -- status` lists everything out of step, the same list as `npm run check`. Confirming is a statement that both languages now say the same thing: never confirm to silence the check.

A fix in one language only (a typo, spacing, punctuation, a broken link) leaves the meaning of both versions the same. Check that the other language does not need the same fix; if it does not, you may confirm without changing it.

**Which command when**

| You have | Then run |
| --- | --- |
| changed a page in both languages, or added a new page pair | `npm run sync -- confirm <section>/<slug>` |
| fixed a typo in one language only, and checked the other needs no change | `npm run sync -- confirm <section>/<slug>` |
| changed one field in a data file | `npm run sync -- confirm <file>#<field>`, as the error message writes it (`programmes/sep-unc.json#duration`) |
| added or changed a whole entry (a news item, a partner, a contact, a photo description) | `npm run sync -- confirm <file>#<id>` (`news.json#2025-06-gdansk-visit`) or, for a programme, `npm run sync -- confirm programmes/<id>.json` |
| added a report, or changed its original or its translation | `npm run sync -- stamp-report <id>`, after the translation matches the original |
| deleted or renamed a page, an entry or a field | `npm run sync -- prune`, then confirm the new name |
| added or removed a programme, or changed a programme's name, audience or page, the office's contact details, or the About page summary | `npm run faculty-texts` |
| lost track of what is out of step | `npm run sync -- status` |

`npm run sync -- adopt` records everything as in step without looking. It was for the first use only: do not run it.

## 6. The faculty layer

The faculty website keeps three standard pages for the office: the laboratory directory entry (team, research, publications), the Units page and the International section. Their addresses are in `src/data/faculty.json`. Facts live in one layer only: team and publications in the directory entry, programmes and news on this site.

- `faculty/*.md` are generated by `npm run faculty-texts` for the faculty's web team. Do not edit them by hand.
- `npm run check:faculty` (and the weekly workflow `.github/workflows/faculty-drift.yml`) compares the live faculty pages with the site: the office address, the link to the site's home page, and, once the faculty publishes the gateway texts, the links to every programme. A link counts however it is written (relative or absolute, http or https), as long as it leads to `www.med.nagoya-u.ac.jp`: the bare `med.nagoya-u.ac.jp` does not serve the site, so a link to it is reported. A link to another page under `/intlexch/`, such as the cancer centre's, does not count as a link to the site. Rules are set in `faculty.json` under `liveChecks`: `active` rules fail, `pending` ones are only reported. Switch `gateway` to `active` once the faculty has published the International section texts.
- A problem on a faculty page that the faculty has been told about, but not yet fixed, goes in `faculty.json` under `knownGaps` (`rule`, `page`, `lang`, `since` as the date recorded, `note` saying what is missing). It is then listed under "Known gaps" in the weekly summary instead of failing, so the job stays green and turns red on any new problem. A gap covers one rule on one page in one language, and only `officeAddress` or `linksToSite`, the rules that pass or fail: a gap on `gateway`, which counts links, could hide the page losing more of them. Once the faculty fixes the page, the check fails until the entry is removed, so a gap cannot outlive the problem.

## 7. Photos

Every photo is an entry in `src/data/images.json`:

```json
{ "id": "...", "kind": "hero | figure | story", "page": "degrees/lund", "story": "<story id>",
  "file": "img/pages/x.webp", "thumb": "img/pages/x-t.webp", "thumbWidth": 560, "thumbHeight": 373, "width": 1280, "height": 853,
  "alt": { "en": "Students and faculty at the joint symposium in Lund.", "ja": "ルンドでの合同シンポジウムに集まった学生と教員" },
  "caption": { "en": "...", "ja": "..." }, "source": "https://www.med.nagoya-u.ac.jp/..." }
```

- `kind` is `hero` (the large photo at the top of a page), `figure` (a photo inside a page) or `story` (a photo of a student report). A `hero` or `figure` names its `page`; a `story` photo names its `story`.
- `alt` is required in both languages: what the photo shows and why it matters, at most 125 characters in English and 60 in Japanese. Do not start with "Photo of". Do not name people unless the photo or page makes it certain.
- `caption` is optional and only states facts (event, place, date).
- `source` is the address of the photo or of the page it was published on.
- Files are WebP under `public/img/`, at most 300 KB (the check fails above that).
- `width`/`height` (and `thumbWidth`/`thumbHeight` when there is a `thumb`) are the real pixel sizes of the files. The check reads the WebP headers and fails when they differ, or when a listed file is not WebP. Its message gives the real size, so you can copy it. The photos taken from the old sites were sized by the audit's photo script (`photos.py publish`), which is kept with the audit tools outside this repository.
- Every file under `public/img/` must be listed, whatever its type. Files the operating system writes on its own (`Thumbs.db`, `desktop.ini`, `.DS_Store`, and the `._name` files macOS writes on some drives) are ignored, and are kept out of git by `.gitignore`.

## 8. Student reports

- `src/data/reports/original/<story id>.json`: the student's own text, `{ "id", "lang", "title", "paragraphs": [...] }`.
- `src/data/reports/translated/<story id>.json`: the automatic translation into the other language, `{ "id", "lang", "method": "machine", "title", "paragraphs": [...] }`, one paragraph per original paragraph. `npm run sync -- stamp-report <story id>` adds the `sourceFingerprint` that records which version of the original it was made from.
- Every story in `stories.json` needs both files, and every file needs a story: the check fails otherwise.
- The report page shows the original in its language and the translation in the other, with a visible "Automatic translation" label and a link to the original. When a person has checked a translation, keep the file and record it in the commit message; the label stays until the office decides on a reviewed status.

## 9. Writing rules

Both languages:
- Write for the visitor and their goal: who can apply, when, how, at what cost, whom to ask.
- Short paragraphs, informative headings (`##`, `###`), lists for documents and steps, tables only for real comparisons.
- Do not copy errors. The audit register (`report/issues.json` in the project folder) lists typos, contradictions and outdated statements found on the old sites: correct typos; drop COVID-era notices and expired calls; when two sources disagree, use the more authoritative and recent one (lab directory, then faculty site, then the 2021 Japanese exchange site, then the older sites) and add the point to `toConfirm`.
- No personal email addresses, no phone extensions of individuals, no staff portraits. Use the contact ids. Photos of students come from their published reports (section 7).
- No marketing filler. No "world-class", "cutting-edge", "unique opportunity".

English: plain British or American spelling consistently (use American: "program" in official programme names as the university writes them, otherwise "programme" is acceptable but be consistent within a page). Address the reader as "you". Avoid em-dash asides and colon-then-reveal sentences.

Japanese: です・ます調, in the plain business register of the yomiyasu rules.

- Keep what the sentence says. When you rewrite, keep its point, what it treats as most important, how firmly it states things (a statement stays a statement, a guess stays a guess) and what it does (explains, asks, announces). Do not add facts, examples or conditions the source does not give.
- Sentences of about 30 to 45 characters, with at most two 読点 each. One topic per paragraph.
- Say who does what. Do not give feelings or wishes to things (no 「制度が支える」 for a rule). Plain verbs rather than metaphors, and no strings of stiff two-kanji words such as 発生 or 担保 where a simple word will do. Set phrases in everyday use may stay.
- Check that every connective (ただし, また, そのため) and every これ or それ at the start of a sentence links to what it should. Drop sentences that only announce what follows (「次の点が挙げられます」) and say the point instead.
- No emoji, no em dash, no colon at the end of a sentence, no brackets that only repeat in other words, and no half-width space between Japanese and English words.
- Lists only for real lists (documents, steps); otherwise write sentences.

If the yomiyasu lint script is installed on your computer, run `python -X utf8 <yomiyasu folder>/scripts/yomiyasu_lint.py <file>` on each Japanese file you changed and fix real problems, in at most two passes. Its score is advisory: keep a technical term or a needed negative even when it is flagged. Without the script, read the file against the list above.

## 10. Abbreviations

Every abbreviation on the site is explained in `src/data/glossary.json`: what it stands for in both languages and, for an institution, organisation or test, its website.

```json
{ "term": "CUHK", "kind": "institution", "en": "The Chinese University of Hong Kong", "ja": "香港中文大学",
  "url": { "en": "https://www.cuhk.edu.hk/english/", "ja": "https://www.cuhk.edu.hk/english/" }, "source": "where the name was confirmed" }
```

- On every content page, the first use of each abbreviation shows what it stands for when you hover over or tap it, and a box at the end of the page lists them with their websites. The full list is the page `about/glossary`. Nothing to do on the pages themselves: write abbreviations as usual.
- `npm run check` fails when a page or a programme, contact, partner or news text uses an abbreviation that is not in the glossary. Add the entry, with a source for the full name and a website you have opened (it must answer). Mark `"common": true` for terms everyone knows (UK, PDF), which then stay out of the box at the end of each page, and `"confirmed": false` when the full name is not certain (it then shows "to be confirmed" and belongs in the glossary page's `toConfirm`).
- Abbreviations in programme boxes, partner names and news are listed on the glossary page but not marked where they appear.

### Pages that exist only in Japanese

When an English page links to a page that exists only in Japanese, an English reader gets a short summary under the link, in a closed box "What this Japanese page says". The summaries are in `src/data/ja-summaries.json`:

```json
{ "url": "https://www.med.nagoya-u.ac.jp/medical_J/others/media/", "en": "The faculty's page for the press. ...",
  "checked": "2026-11-25", "method": "machine", "evidence": ["報道取材・撮影許可願", "..."] }
```

- First look for an English version of the page (a language switch, an `/en/` or `medical_E` address with the same content). If there is one, link it instead and write no summary.
- Otherwise write two or three plain sentences, at most 70 words: what the page is, who it is for, and what a reader must submit or know. Only what the page says. Do not retype a deadline, phone number or email that a data file holds or that may change: say the page gives it. Keep the Japanese name of a form or office in brackets so the reader can find it on the page.
- `evidence` holds the Japanese phrases from the page that support each fact, for whoever checks the summary. `checked` is the day it was written; `method` is always `machine`, and the box says the summary was written automatically and that the Japanese page is right if they differ.
- `npm run check` fails when an English page links to a page in Japanese (by its address: `medical_J`, `/ja/`, `/japanese/` and so on) that has no summary, and when a summary is no longer linked from any English page. Links to PDF files need no summary, because their folder does not tell their language.

## 11. The office and how to reach it

- The office's building, floor and room (`location`) and its map position (`map`) are in `src/data/contacts.json`, entry `intl-office`. The contact cards and the page `about/access` show them from there.
- `about/access` gives the walking route from Tsurumai Station in both languages. Its letters A to I match the route map (`public/img/pages/office-route-map.webp`, listed in `images.json`) and the photos of the printable route guides, `public/files/route-map-en.pdf` and `public/files/route-map-ja.pdf`, which are the office's own PDFs.
- If the office moves or the route changes, update `location` and `map`, the steps on both pages, the map image and the two PDFs together.
