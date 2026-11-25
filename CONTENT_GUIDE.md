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
| `about` | `index`, `team`, `research`, `contact` |

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

## 5. Writing rules

Both languages:
- Write for the visitor and their goal: who can apply, when, how, at what cost, whom to ask.
- Short paragraphs, informative headings (`##`, `###`), lists for documents and steps, tables only for real comparisons.
- Do not copy errors. The audit register (`report/issues.json` in the project folder) lists typos, contradictions and outdated statements found on the old sites: correct typos; drop COVID-era notices and expired calls; when two sources disagree, use the more authoritative and recent one (lab directory, then faculty site, then the 2021 Japanese exchange site, then the older sites) and add the point to `toConfirm`.
- No personal email addresses, no phone extensions of individuals, no photos of people. Use the contact ids.
- No marketing filler. No "world-class", "cutting-edge", "unique opportunity".

English: plain British or American spelling consistently (use American: "program" in official programme names as the university writes them, otherwise "programme" is acceptable but be consistent within a page). Address the reader as "you". Avoid em-dash asides and colon-then-reveal sentences.

Japanese: です・ます調. Follow the yomiyasu guide (`C:\Users\Basile\.claude\skill-library\yomiyasu\SKILL.md`, domain `business`): sentences of about 30–45 characters, at most two 読点 per sentence, no em dashes, no colons at the end of a sentence, no emoji, no half-width space between Japanese and English words, no paraphrasing parentheses. Run `python -X utf8 C:\Users\Basile\.claude\skill-library\yomiyasu\scripts\yomiyasu_lint.py <file>` on Japanese files and fix real problems (at most two passes).
