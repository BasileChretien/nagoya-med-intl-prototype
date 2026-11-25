# Content guide

How content is stored and written in this site. Read it before adding or changing a page.

## 1. Where things live

| What | Where | One file per |
| --- | --- | --- |
| Prose pages | `src/content/pages/en/<section>/<slug>.md` and `src/content/pages/ja/<section>/<slug>.md` | page and language |
| Programme facts | `src/data/programmes/<id>.json` | programme |
| Staff | `src/data/staff.json` | the whole team |
| Contact points | `src/data/contacts.json` | all contacts |
| Partner universities | `src/data/partners.json` | all partners |
| News and events | `src/data/news.json` | all items |
| Student stories | `src/data/stories.json` | all stories |

A fact is stored once. A page never retypes a deadline, a capacity, a staff title or an email that is already in a data file: the layout shows it from the data. Prose explains; data states.

The English and Japanese files of a page have **the same path** after the language folder, so the site can link them. Every page must exist in both languages.

## 2. Sections and pages

| Section | Slugs |
| --- | --- |
| `study-in-nagoya` | `index`, `clinical-clerkship`, `research-training`, `living-in-nagoya`, `faq` |
| `study-abroad` | `index`, `clinical-electives`, `research-abroad`, `short-programmes`, `scholarships`, `honours-programme`, `medical-english`, `faq` |
| `degrees` | `index`, `joint-degree`, `adelaide`, `lund`, `freiburg`, `cuhk-double-degree`, `unc-scholar-exchange`, `admission`, `faq` |
| `partnerships` | `index`, `game`, `mirai`, `agreements`, `symposia`, `visits` |
| `about` | `index`, `contact` (team, research and publications live in the faculty's directory entry, linked from `about`) |

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

## 4. Programme file (`src/data/programmes/<id>.json`)

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
  "sources": ["https://..."],
  "toConfirm": ["..."]
}
```

Only `section`, `name`, `audience`, `contact` and `page` are required. Leave a field out rather than guess.

**Deadlines.** Never invent a date.
- A recurring rule from the sources ("6 months before the start") → `"status": "rolling"`.
- A dated deadline in the future → `"status": "open"` and `"date": "YYYY-MM-DD"`.
- Only past deadlines are known → `"status": "tba"`, text like "To be announced (last cycle: applications 6–15 January 2025)", and a `toConfirm` entry.

**Contact ids.** `intl-office` (Office of International Affairs, general) and `jdp-office` (joint and double degrees). Others may be added to `contacts.json`.

## 5. Keeping every version in step

No version may fall behind another. `npm run check` fails when:

- an English or Japanese page changed without its counterpart, or a bilingual field (`{ "en", "ja" }` in `src/data/`) changed in one language only, or has only one of the two;
- a fact (programmes, contacts, partners) gives different numbers in its two languages. Numbers written differently count as the same: `1.5 million` and `150万`, `1 billion` and `10億`, `20,000 to 30,000` and `2〜3万`, `third-year` and `3年生`, `Apr` and `4月`, `3,000` and `三千`. The numbers 0 and 1 are not compared, because "a", "one", "single" and `1つ` are written in too many ways;
- a report translation was made from an older version of its original;
- the texts in `faculty/` no longer match what the data produces.

How to change something:

1. Change both languages (for a report, update the translation after the original).
2. Check that they say the same thing.
3. Record it: `npm run sync -- confirm <page slug or field key>` (for a report: `npm run sync -- stamp-report <id>`). The error message gives the exact command.
4. If a programme, contact or the About summary changed, run `npm run faculty-texts`. Once the new site is live at `/intlexch/`, send the changed files in `faculty/` to the faculty's web team. Before that, do not send them: their links use the new site's addresses, which do not exist yet.

`npm run sync -- status` lists everything out of step, the same list as `npm run check`. Confirming is a statement that both languages now say the same thing: never confirm to silence the check.

## 6. The faculty layer

The faculty website keeps three standard pages for the office: the laboratory directory entry (team, research, publications), the Units page and the International section. Their addresses are in `src/data/faculty.json`. Facts live in one layer only: team and publications in the directory entry, programmes and news on this site.

- `faculty/*.md` are generated by `npm run faculty-texts` for the faculty's web team. Do not edit them by hand.
- `npm run check:faculty` (and the weekly workflow `.github/workflows/faculty-drift.yml`) compares the live faculty pages with the site: the office address, the link to the site's home page, and, once the faculty publishes the gateway texts, the links to every programme. A link counts however it is written (relative, with or without `www.`); a link to another page under `/intlexch/`, such as the cancer centre's, does not count as a link to the site. Rules are set in `faculty.json` under `liveChecks`: `active` rules fail, `pending` ones are only reported. Switch `gateway` to `active` once the faculty has published the International section texts.
- A problem on a faculty page that the faculty has been told about, but not yet fixed, goes in `faculty.json` under `knownGaps` (`rule`, `page`, `lang`, `since` as the date recorded, `note` saying what is missing). It is then listed under "Known gaps" in the weekly summary instead of failing, so the job stays green and turns red on any new problem. A gap covers one rule on one page in one language, and only `officeAddress` or `linksToSite`, the rules that pass or fail: a gap on `gateway`, which counts links, could hide the page losing more of them. Once the faculty fixes the page, the check fails until the entry is removed, so a gap cannot outlive the problem.

## 7. Photos

Every photo is an entry in `src/data/images.json`:

```json
{ "id": "...", "kind": "hero | figure | story", "page": "degrees/lund", "story": "<story id>",
  "file": "img/pages/x.webp", "thumb": "img/pages/x-t.webp", "thumbWidth": 560, "thumbHeight": 373, "width": 1280, "height": 853,
  "alt": { "en": "Students and faculty at the joint symposium in Lund.", "ja": "ルンドでの合同シンポジウムに集まった学生と教員" },
  "caption": { "en": "...", "ja": "..." }, "source": "https://www.med.nagoya-u.ac.jp/..." }
```

- `alt` is required in both languages: what the photo shows and why it matters, at most 125 characters in English and 60 in Japanese. Do not start with "Photo of". Do not name people unless the photo or page makes it certain.
- `caption` is optional and only states facts (event, place, date).
- Files are WebP under `public/img/`, at most 300 KB (the check fails above that).
- `width`/`height` (and `thumbWidth`/`thumbHeight` when there is a `thumb`) are the real pixel sizes of the files; the check reads the WebP headers and fails when they differ, or when a listed file is not WebP. `../tools/photos.py publish` writes them.
- Every file under `public/img/` must be listed, whatever its type. Files the operating system writes on its own (`Thumbs.db`, `desktop.ini`, `.DS_Store`, and the `._name` files macOS writes on some drives) are ignored, and are kept out of git by `.gitignore`.

## 8. Student reports

- `src/data/reports/original/<story id>.json`: the student's own text, `{ "lang", "title", "paragraphs": [...] }`.
- `src/data/reports/translated/<story id>.json`: the automatic translation into the other language, `{ "lang", "method": "machine", "title", "paragraphs": [...] }`, one paragraph per original paragraph.
- The report page shows the original in its language and the translation in the other, with a visible "Automatic translation" label and a link to the original. When a person has checked a translation, keep the file and record it in the commit message; the label stays until the office decides on a reviewed status.

## 9. Writing rules

Both languages:
- Write for the visitor and their goal: who can apply, when, how, at what cost, whom to ask.
- Short paragraphs, informative headings (`##`, `###`), lists for documents and steps, tables only for real comparisons.
- Do not copy errors. The audit register (`report/issues.json` in the project folder) lists typos, contradictions and outdated statements found on the old sites: correct typos; drop COVID-era notices and expired calls; when two sources disagree, use the more authoritative and recent one (lab directory, then faculty site, then the 2021 Japanese exchange site, then the older sites) and add the point to `toConfirm`.
- No personal email addresses, no phone extensions of individuals, no photos of people. Use the contact ids.
- No marketing filler. No "world-class", "cutting-edge", "unique opportunity".

English: plain British or American spelling consistently (use American: "program" in official programme names as the university writes them, otherwise "programme" is acceptable but be consistent within a page). Address the reader as "you". Avoid em-dash asides and colon-then-reveal sentences.

Japanese: です・ます調. Follow the yomiyasu guide (`C:\Users\Basile\.claude\skill-library\yomiyasu\SKILL.md`, domain `business`): sentences of about 30–45 characters, at most two 読点 per sentence, no em dashes, no colons at the end of a sentence, no emoji, no half-width space between Japanese and English words, no paraphrasing parentheses. Run `python -X utf8 C:\Users\Basile\.claude\skill-library\yomiyasu\scripts\yomiyasu_lint.py <file>` on Japanese files and fix real problems (at most two passes).
