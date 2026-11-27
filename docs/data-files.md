# Data files: ids, examples and allowed values

A reference for the files in `src/data/`. The [content guide](../CONTENT_GUIDE.md) says when to change them; this page says what goes in them. The schema in `src/content.config.ts` is the authority: if this page and the schema disagree, the schema wins, and this page should be corrected.

General rules for every file:

- The files are JSON. Text goes in double quotes, entries are separated by commas, and the last entry of a list has no comma after it. One misplaced comma stops the build: `node scripts/check-content.mjs` names the file and the line.
- A text that visitors read in both languages is a pair: `{ "en": "...", "ja": "..." }`. Give both languages, always.
- `sources` lists the official pages the facts come from (full `https://` addresses). `toConfirm` lists what the office still has to confirm, in English. Both feed the [content status](https://basilechretien.github.io/nagoya-med-intl-prototype/en/status/) page.
- An `id` is lower case, with words joined by hyphens (`2025-06-gdansk-visit`). It must be unique in its file and never changes once published, because other files and page addresses use it.
- Leave out an optional field rather than guess. Never invent a date, a number, a name or an address.

## Programme ids

One file per programme in `src/data/programmes/`; the file name is the id. A page shows a programme's fact box when its front matter lists the id under `programmes:`. A page's address is `/en/<page>/` or `/ja/<page>/` on the site.

| Id | Short name | 短い名前 | Page | Contact |
| --- | --- | --- | --- | --- |
| `basic-medical-seminar` | Basic medical seminar abroad | 基礎医学セミナー海外派遣 | `study-abroad/research-abroad` | `intl-office` |
| `cambridge-exchange` | Cambridge exchange | ケンブリッジ大学交流 | `study-abroad/short-programmes` | `intl-office` |
| `clinical-clerkship` | Clinical clerkship | 臨床実習 | `study-in-nagoya/clinical-clerkship` | `intl-office` |
| `clinical-electives` | Clinical electives abroad | 海外臨床実習 | `study-abroad/clinical-electives` | `intl-office` |
| `colorado-entrepreneurship` | Entrepreneurship program with Colorado | コロラド大学との起業家養成 | `study-abroad/short-programmes` | `intl-office` |
| `dd-cuhk` | Double degree with CUHK | 香港中文大学ダブル・ディグリー | `degrees/cuhk-double-degree` | `jdp-office` |
| `game-case-discussion` | Online case discussion | オンライン症例検討 | `study-abroad/medical-english` | `intl-office` |
| `hawaii-medical-english` | Hawaii medical English | ハワイ医学英語研修 | `study-abroad/medical-english` | `intl-office` |
| `jdp-adelaide` | Nagoya = Adelaide JDP | 名古屋＝アデレードJDP | `degrees/adelaide` | `jdp-office` |
| `jdp-freiburg` | Nagoya = Freiburg JDP | 名古屋＝フライブルクJDP | `degrees/freiburg` | `jdp-office` |
| `jdp-lund` | Nagoya = Lund JDP | 名古屋＝ルンドJDP | `degrees/lund` | `jdp-office` |
| `leicester-summer-school` | Leicester medical English | レスター大学医学英語 | `study-abroad/medical-english` | `intl-office` |
| `lmu-nu-usmle` | USMLE review classes | USMLE講義 | `study-abroad/medical-english` | `intl-office` |
| `research-abroad` | Research placement abroad | 基礎系配属海外派遣 | `study-abroad/research-abroad` | `intl-office` |
| `research-training` | Research training | 研究研修 | `study-in-nagoya/research-training` | `intl-office` |
| `sep-unc` | Scholar exchange with UNC | UNC客員研究員交換 | `degrees/unc-scholar-exchange` | `jdp-office` |
| `shibahara-entrepreneurship` | Entrepreneurship abroad | 起業家養成海外派遣 | `study-abroad/short-programmes` | `intl-office` |
| `shibahara-fund` | Shibahara Fund | 柴原慶一基金 | `study-abroad/scholarships` | `intl-office` |
| `tei-summer-camp` | TEI Summer Camp | TEIサマーキャンプ | `study-abroad/short-programmes` | `intl-office` |
| `uk-short-clinical` | Short clerkship in the UK | 英国短期臨床実習 | `study-abroad/short-programmes` | `intl-office` |

The folder is the full list. When you add or remove a programme file, add or remove its row here in the same change. The fields of a programme file are described in section 4 of the content guide.

## news.json

A list of news items, events and calls. The news page sorts them by date, newest first, so their order in the file does not matter. It groups them by year. When any item is more than one year old, the page shows a note that older items are kept as a record and are not current. Nothing is moved or hidden.

| Field | Required | Allowed values |
| --- | --- | --- |
| `id` | yes | `YYYY-MM-<short-name>`, for example `2025-06-gdansk-visit`. Items added in the editing page get `news-<code>` automatically |
| `date` | yes | The date of the item, `YYYY-MM-DD` |
| `category` | yes | `news` (an announcement), `event` (a visit, lecture, symposium or other event), `call` (a call for applications) |
| `title` | yes | Pair `{ "en", "ja" }`, one line |
| `summary` | no | Pair, one to three sentences |
| `body` | no | Pair: the full text of the item, paragraphs separated by a blank line. It is shown on the item's own page |
| `until` | no | Last day of an event or call that lasts several days, `YYYY-MM-DD` |
| `page` | no | A page of this site the item is about, as a page address (`study-abroad/short-programmes`) or `stories` |
| `partners` | no | List of partner ids from `partners.json` the item concerns |
| `url` | no | Full `https://` address of the page with the details |
| `sources` | no | List of official pages the item comes from |
| `toConfirm` | no | What the office still has to confirm, in English, as for the other files |

A call states its deadline in the summary only when the programme file does not hold it. When it does, say "see the programme page" and link `url` to it.

For a complete example, open `src/data/news.json` and look at the item `2024-02-colorado-call` (a past call with `toConfirm`) or `2024-02-unc-geriatrics` (an event with `until`). Copy an item from the file rather than from this guide, so the example is always the current one.

After adding or changing an item, run `npm run sync -- confirm news.json#<id>`.

## stories.json

One entry per student report. A story is written in one language only, so its fields are plain text, not pairs. Each story needs its full text in `src/data/reports/original/<id>.json` and an automatic translation in `src/data/reports/translated/<id>.json` (section 8 of the content guide).

| Field | Required | Allowed values |
| --- | --- | --- |
| `id` | yes | `<kind>-<year>-<short-name>`. The ids in use follow `clerkship-<year>-report<n>` (`clerkship-2011-report4`), `outgoing-<year>-<nn>` (`outgoing-2016-01`), `outgoing-<year>-medj<nn>` (`outgoing-2006-medj01`), `research-<year>-<full-name>` (`research-2014-kimberley-evans`) and `degree-<n>` (`degree-30`). One older entry is `clerkship-past-report`. |
| `type` | yes | `incoming-clerkship` (clinical clerkship in Nagoya), `incoming-research` (research in Nagoya), `outgoing` (Nagoya students abroad), `degree` (joint degree) |
| `name` | yes | The student's name as the report gives it |
| `university` | yes | The student's home university for incoming students, the host for outgoing ones. `Not stated` when the report does not say |
| `country` | yes | Country name in English (`Australia`, `United States`) |
| `countryCode` | no | Two-letter ISO country code in capitals (`AU`, `US`) |
| `year` | yes | Year of the stay, a number without quotes (`2015`) |
| `departments` | no | List of departments named in the report, in English |
| `lang` | yes | `en` or `ja`: the language the student wrote in |
| `title` | no | The report's title, in its language |
| `excerpt` | yes | The first two or three sentences of the report, in its language |
| `source` | yes | Full `https://` address of the report on the official site |

For a complete example, open `src/data/stories.json` and look at the entry `degree-30`.

`stories.json` is not compared between languages, so a new story needs no `confirm`. Its translation needs `npm run sync -- stamp-report <id>`, and each of its photos needs `npm run sync -- confirm images.json#<photo id>`.

## partners.json

One entry per partner institution. The agreements page groups them by region, and the GAME page lists those marked `GAME`.

| Field | Required | Allowed values |
| --- | --- | --- |
| `id` | yes | Short name of the institution, `nus-medicine` |
| `name` | yes | Pair: the official name in English and in Japanese |
| `country` | yes | Pair: the country in English and in Japanese |
| `countryCode` | yes | Two-letter ISO country code in capitals |
| `region` | yes | `Asia`, `Oceania`, `Europe`, `North America`, `Latin America`, `Africa`, `Middle East` |
| `links` | no | Any of `GAME` (GAME network member), `MIRAI` (MIRAI programme partner), `JDP` (joint degree), `DD` (double degree), `SEP` (scholar exchange), `Agreement` (exchange agreement with the school), `Clerkship` (clinical clerkship exchange) |
| `url` | no | Full `https://` address of the partner's own site |
| `since` | no | Year the first agreement was signed, as text (`"2008"`), only when a source gives it |
| `sources`, `toConfirm` | no | As above |

For a complete example, open `src/data/partners.json` and look at the entry `nus-medicine`.

After a change, run `npm run sync -- confirm partners.json#<id>`. Numbers in `name` and `country` must match in the two languages.

## contacts.json

One entry per contact point that pages and programmes refer to by id. Programmes name one in `contact`. The ids in use are `intl-office` (Office of International Affairs: general questions and every programme not listed next) and `jdp-office` (the joint degrees, the double degree and the scholar exchange: `jdp-adelaide`, `jdp-freiburg`, `jdp-lund`, `dd-cuhk` and `sep-unc`, as the table of programmes above shows). Only office addresses go here, never a personal address.

| Field | Required | Allowed values |
| --- | --- | --- |
| `id` | yes | Short name, `intl-office` |
| `label` | yes | Pair: the name of the office or desk |
| `audience` | yes | Pair: who should write to this address |
| `email` | yes | The office's shared address |
| `phone` | no | International format with hyphens, as in the entries in the file |
| `fax` | no | Same format, only when the office confirms it is in use |
| `address` | no | Pair: postal address |
| `location` | no | Pair: building, floor and room |
| `map` | no | `{ "lat": 35.1, "lng": 136.9 }`, the map position of the office, in decimal degrees |
| `sources`, `toConfirm` | no | As above |

For a complete example, open `src/data/contacts.json`: `jdp-office` shows the required fields with `phone` and `address`, and `intl-office` shows `location` and `map` as well.

After a change, run `npm run sync -- confirm contacts.json#<id>`, then, when you changed the `email` or `phone` of `intl-office`, `npm run faculty-texts`: the texts for the faculty's pages show that email address and phone number. They use no other field and no other contact.

## images.json and the report files

Section 7 (photos) and section 8 (student reports) of the content guide describe these files, with an example.
