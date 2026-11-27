# Launch checklist

What changes when the prototype becomes the official site at `www.med.nagoya-u.ac.jp/intlexch/`. The items marked
"office" or "faculty IT" are decisions this repository cannot make.

## In this repository

1. Build for the faculty's address: `SITE_URL=https://www.med.nagoya-u.ac.jp BASE_PATH=/intlexch npm run build`,
   or run **Build for the faculty server** from the Actions tab. No file changes: `src/lib/address.mjs` reads the two
   values for the build and for its checks. See "Hosting on the faculty server" below.
2. `src/lib/launch.mjs`: set `PROTOTYPE` to `false`. This removes the `noindex` tag from every page and adds the
   sitemap line to `robots.txt`.
3. Remove the prototype banner and the prototype note in the footer (`protoLead`, `protoText`, `footerAbout` in
   `src/i18n/ui.ts`, used by `src/components/Header.astro` and `src/components/Footer.astro`), and the prototype
   wording on the front page (`src/pages/index.astro`).
4. Replace the prototype descriptions on `about/privacy` and `about/accessibility` with the statements agreed below,
   in both languages, and confirm them (`npm run sync -- confirm about/privacy`).
5. Build, run `npm run check` and `node scripts/check-content.mjs --dist`, and deploy.

## With faculty IT

- **Redirects.** Every old address must lead to its new page. The list (old address, new page) is still to be
  written from the audit's list of the 790 old pages; it goes into the server settings below.
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

## Hosting on the faculty server

The site is a folder of ordinary files (pages, styles, photos, the search index, feeds and calendars): it needs no
database, no PHP and no program running on the server. Any web server that serves files can host it.

**What was checked (26 November 2026).** The faculty's server answers as Apache 2.4 on Rocky Linux, and it already
serves the old exchange site under `/intlexch/` as `.html` pages. The site was built with
`SITE_URL=https://www.med.nagoya-u.ac.jp BASE_PATH=/intlexch` and served from a plain file server under `/intlexch/`:

- all 974 pages built, and `check-content.mjs --dist` found every one of 37,734 internal links;
- no page kept the GitHub address; canonical addresses, the sitemap, the news feeds and the calendars all name
  `https://www.med.nagoya-u.ac.jp/intlexch/`;
- the pages, styles, photos, PDF route maps, search (Japanese and English), feeds and calendars all loaded from
  `/intlexch/`.

The new folders (`en/`, `ja/`, `_astro/`, `img/`, `files/`, `pagefind/`) do not clash with the old site's
(`english/`, `japanese/`, `japan/`), so the old files can stay in place until the redirects are set. Only the old
`/intlexch/index.html` is replaced by the new one, which sends each visitor to their language.

**The Frontier-kai members' area stays exactly where it is.** `/intlexch/japanese/alumni/` holds the Frontier-kai's
newsletters and member information behind the server's own ID and password (checked 27 November 2026: it answers
401 with a password prompt, and plain `http://` is sent to `https://`). It is not part of this site and nothing here
replaces it: the site only links to it (`src/data/protected-areas.json`, the support page). Three rules keep it safe:

1. **Never delete, move or replace `/intlexch/japanese/alumni/`, or the password files that protect it.** When the
   old site is retired, remove its pages one by one or folder by folder, leaving `japanese/alumni/` in place.
2. **No redirect may catch it.** Redirect single old pages only, one per line (`/intlexch/japanese/index.html`, as
   below). A plain `Redirect` line also catches every address under its path, so a line for any folder that holds the
   members' area (`/intlexch/`, `/intlexch/japanese/` or `/intlexch/japanese/alumni/`, with or without the final
   slash) would catch it too, and so would any `RedirectMatch` or `RewriteRule` pattern that covers those folders.
   Members would be sent to the new site instead of their area.
3. **Uploads only add or replace files.** Never empty `/intlexch/` before uploading, and never use a "mirror" or
   "sync" option that deletes files missing from the upload.

Every Monday the weekly check asks for the area without a password and opens an issue if it answers without one, is
gone, or sends visitors elsewhere before asking. **It cannot see a redirect that Apache applies only after a member
signs in**, which is what happens to a redirect written in an `.htaccess` file when the area keeps its own password:
a visitor without the password still gets the prompt, so the check reports the area as fine, and only members are
sent away. Rule 2 is what prevents that. After the switch, and after any change to the redirects, someone who has the
members' ID and password signs in once and confirms the area still opens.

**Server settings.** Two settings the file server could not show, and the redirects, go in `/intlexch/.htaccess`
(faculty IT must allow it with `AllowOverride FileInfo`, or put the same lines in the server's own configuration):

```apache
# The site's own "page not found", in both languages
ErrorDocument 404 /intlexch/404.html
# File types older settings may not know
AddType image/webp .webp
AddType text/calendar .ics
AddCharset utf-8 .html .xml .ics .txt .css .js .json
# Old addresses to their new pages, one line each, for example:
Redirect 301 /intlexch/english/index.html /intlexch/en/
Redirect 301 /intlexch/japanese/index.html /intlexch/ja/
# Never redirect /intlexch/japanese/alumni/ (the Frontier-kai members' area). Redirect also catches every
# address under its path: name single pages only, never a folder that holds the area (/intlexch/,
# /intlexch/japanese/), and use no RedirectMatch or RewriteRule pattern that covers those folders.
```

**Getting the files onto the server.** Three ways, from the simplest to set up:

1. **By hand.** Run **Build for the faculty server** from the Actions tab, download the `site-for-server` zip from
   the run's page, and upload its contents to `/intlexch/` the way the faculty uploads files today. A few minutes
   each time; the weekly rebuild then becomes a weekly (or monthly) upload.
2. **The server fetches it.** A scheduled job on the faculty server downloads the latest build and puts it in place.
   This needs only outgoing access from the server, which university firewalls usually allow.
3. **GitHub sends it.** The deploy workflow uploads the build over SFTP after every change, with an account and key
   stored as repository secrets. This needs the faculty's server to accept connections from GitHub's machines,
   which the university firewall may not allow.

Whichever is chosen, the checks still run on every change, before anything reaches the server, and the upload adds or
replaces files without deleting any (see the members' area above).

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
- **The members' area's content.** Who uploads the Frontier-kai newsletters and member information to
  `/intlexch/japanese/alumni/` today, and who keeps its ID and password. If a vendor does it, the task needs a new
  owner when the vendor contracts end.

## Already in place

- Language links between the two versions of each page, canonical addresses and sharing previews (`src/layouts/Base.astro`).
- The sitemap with both languages (`@astrojs/sitemap` in `astro.config.mjs`), built on every deploy.
- Structured data for the office, the breadcrumb trail and each programme (`src/lib/structured.ts`), checked after
  every build by `scripts/check-content.mjs --dist`.
- The weekly check of outside links and deadlines (`.github/workflows/weekly-check.yml`) and the monthly tool
  updates (`.github/dependabot.yml`). In the repository's settings, turn on Dependabot alerts and security updates
  too: they are not set by `dependabot.yml`.
