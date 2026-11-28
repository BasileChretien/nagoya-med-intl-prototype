# Setting up the editing page

The site has an editing page for the office, at
`https://basilechretien.github.io/nagoya-med-intl-prototype/admin/`. It stays on GitHub Pages, also after the site
moves to the faculty server (see "Where the editing page lives"). It is
[Sveltia CMS](https://sveltiacms.app/en/docs), a free editor (MIT licence) that works on top of this GitHub
repository: it shows forms instead of files, and every save becomes a commit on `main`. The office's guide, in
Japanese, is [editing-guide-ja.md](editing-guide-ja.md).

The editor itself needs no setup: `public/admin/index.html` loads it from the site itself (the devDependency
`@sveltia/cms`, copied into the build by `scripts/copy-editor.mjs`) and `public/admin/config.yml` describes what it
edits. The **sign-in** needs a one-time setup, described here; for this site it was done on 28 November 2026. Only
the owner of the GitHub repository can do it, because it installs a GitHub App on the repository. Allow about one
hour.

## What staff can and cannot edit

| In the editing page | Needs technical help |
| --- | --- |
| News and events (`src/data/news.json`): add, change, delete items | Photos (each needs a description in both languages in `images.json`) |
| Programmes (`src/data/programmes/*.json`): deadline, "checked" date, who can apply, duration, places, cost, funding, language test, eligibility, how to apply | New programmes, new pages, deleting either |
| Contacts (`src/data/contacts.json`): email, phone, address, building and room | Partners, student stories and reports, the glossary, the faculty texts |
| Page texts in the five sections: title, description, summary, body (as Markdown text) | Page settings such as `sources`, `toConfirm`, `order`, `status`, `updated` |

Fields that the form does not show (ids, `sources`, `toConfirm`, `partners`, `page`, `contact`...) are written back
unchanged when an entry is saved, as the Sveltia CMS documentation states
([data output](https://sveltiacms.app/en/docs/data-output),
[single-file collections](https://sveltiacms.app/en/docs/collections/entries/single-file)).

## How sign-in works: Sveltia CMS Additions

Sign-in uses [Sveltia CMS Additions](https://sveltiacms.app/en/docs/additions), the service the Sveltia CMS team
now recommends instead of their older Authenticator
([sveltia-cms-auth README](https://github.com/sveltia/sveltia-cms-auth)). It was chosen because:

- **Staff need no GitHub account.** Each person signs in with a username and a password that the service manages.
  Their saves go through the site's own GitHub App, which only has access to this repository
  ([Users and roles](https://sveltiacms.app/en/docs/additions/users)).
- **It is free.** It runs on the Cloudflare Workers Free plan, is open source (MIT) and has no fees of its own.
- **Accounts are managed in the editor**, on an Administration page: add a person, reset a password, disable an
  account when someone leaves. No email is sent by the service: you pass on the temporary password yourself.
- Roles: `admin` (manages users and settings), `editor` (edits and saves), `viewer` (reads and comments only).
  It also shows who else has an entry open, so two people do not overwrite each other.

The older Authenticator would also work and is free, but every editor would need their own GitHub account with
write access to the repository. That is harder for staff, and each account would have access to everything.

Limits of Additions, from its documentation: a role applies to the whole repository (GitHub tokens cannot be
limited to some files); GitHub Enterprise is not supported; it needs Sveltia CMS v0.271.0 or later (the site serves
5.0.2, so this is met).

## Before you start

1. **Decide who owns the repository.** The repository is now under a personal account. Move it to a GitHub
   organisation the office owns before the developer leaves, so the office keeps control of the site, the sign-in
   and the GitHub App. Its Pages address then becomes `https://<organisation>.github.io/nagoya-med-intl-prototype/`;
   if the organisation publishes no other Pages site, that host serves only this site, which keeps the editor's
   sign-in apart from anything else (see "Where the editing page lives"). Moving it is simplest **before** this
   setup. If you move it later: change `repo:` and `site_url` in `public/admin/config.yml`, install the GitHub App
   on the moved repository (Administration page, GitHub section), and replace the host in the allowed domains.
2. You need: the repository owner's GitHub account, and a free [Cloudflare](https://dash.cloudflare.com/sign-up)
   account (the office's, not a personal one). Turn on two-factor authentication on both. For now, this site's
   service runs on the developer's own Cloudflare account (see "Keeping it running").
3. Keep a password manager ready for the admin secret.

## Step 1. Deploy the service on Cloudflare

Follow [Additions setup, step 1](https://sveltiacms.app/en/docs/additions/setup):

1. On that page, click **Deploy to Cloudflare**. It copies a small configuration repository into your GitHub
   account, creates the storage and deploys the service with Workers Builds. On Cloudflare's form, connect GitHub
   under **Git account** and keep the name `sveltia-cms-additions`. Leave **Protect with Cloudflare Access** off: it
   would put a Cloudflare login in front of the sign-in service. Do not connect the site's own repository to a
   Worker (Workers & Pages > Create > Import a repository): that makes a second Worker, which tries to build the site
   on every push and fails.
2. It asks for one value, `ADMIN_SECRET`. Create it with `openssl rand -base64 32` (at least 32 characters) and
   store it in the password manager. Whoever has it can create admin accounts.
3. In the Cloudflare dashboard, open **Workers & Pages**, select the new Worker, open **Domains** and turn on the
   **Production** `workers.dev` address if it is off. Note the address, for example
   `https://sveltia-cms-additions.<your-account>.workers.dev`.

## Step 2. Point the editor at the service

In `public/admin/config.yml`, under `backend:`, set `auth_type: additions` and put the Worker's address after
`base_url:`. For this site, both are set:

```yaml
backend:
  name: github
  repo: BasileChretien/nagoya-med-intl-prototype
  branch: main
  auth_type: additions
  base_url: https://sveltia-cms-additions.basilechretien.workers.dev
```

Both keys are needed: `base_url` is required when `auth_type` is `additions`. If the service gets another address,
change `base_url` like any developer change (through a pull request). When the deploy has finished, the editing page
shows a username and password form and a **Use Admin Secret** button.

## Step 3. Run the setup wizard

1. Open `https://basilechretien.github.io/nagoya-med-intl-prototype/admin/` and click **Use Admin Secret**. Enter
   the secret.
2. Wizard step 1 creates the first admin account (yours) and adds the site's domain to the allowed domains.
3. Wizard step 2 creates a GitHub App for the site and asks you to install it. Choose **Only select repositories**
   and select only this repository.
4. GitHub sends you back to the editor. Sign in with the new admin account.

## Step 4. Settings on the Administration page

Open **Administration** in the editor.

- **Domains** (the list of sites that may use the service; this replaces the `ALLOWED_DOMAINS` variable of the
  older Authenticator): one host name per line, and only the GitHub Pages host: `basilechretien.github.io` now, or
  `<organisation>.github.io` after the repository moves. Never add `www.med.nagoya-u.ac.jp`: the editing page is not
  served there. No wildcards. Add `localhost` only while testing on your own computer, and remove it afterwards.
- **Allow signing in with GitHub**: leave it off. Staff sign in with a password.
- **Commit Author**: the default, "The person who made the change", records each save under the person's name.

## Step 5. Give each staff member access

In **Administration > Users**, add each person: a username (3 to 30 lowercase letters, digits, dots, hyphens or
underscores; it cannot be changed), their name, their work email if you want, and the role `editor`. The editor
shows a temporary password once; the **Email to** button opens your email app with the username, the password and
the sign-in link. At first sign-in the person chooses their own password (at least 12 characters).

A forgotten password: **Reset Password** in the person's menu gives a new temporary password. Someone leaves:
**disable** the account rather than deleting it. Keep at least two admins, so the office is not locked out.

## Step 6. Test after signing in

1. Sign in as an editor. Open each of the five **ページ** collections and check that it lists the existing pages of
   that section, and that each page opens in both languages (the language switch at the top of the form shows the
   Japanese and the English text). Open **プログラム**, **お知らせ・イベント** and **連絡先** and check that the
   existing entries are listed with their Japanese names.
2. Open **ページ：私たちについて / Pages: About us**, choose a page, and add a full stop at the end of the Japanese
   summary. Save.
3. In the repository, open the commit list of `main`: a commit `[editor] 更新：ページ「...」` has appeared. Open it
   and check that **only the summary line changed**. Tried on the live site on 28 November 2026: the first save of a
   page or a programme also puts that file's lines in the editor's order once, without changing any value (for a
   page, in both language files); later saves of those files changed only the edited line. A news save changed only
   its own line. Contacts were not tried. If a save changes a value you did not edit, tell the developer before staff
   start.
4. Open **Actions**: the "Check and deploy" run for that commit is green, its step "Record editor saves as in step in
   both languages" lists the page, and the job `record-editor-sync` has pushed a commit
   `chore: record editor saves as in step [skip ci]`.
5. After a few minutes the site shows the change. Remove the full stop the same way.
6. Repeat once with a programme (change the "checked" date and set it back), once with a news item and once with a
   contact (change the building and room and set it back), and check the JSON diff in the same way.

## What happens after a save

Each save commits straight to `main` (the Simple workflow). The commit message starts with `[editor]`
(`backend.commit_messages` in `config.yml`). `.github/workflows/deploy.yml`, on every run on `main` (a push, the
Monday rebuild or a manual run), then:

1. runs `scripts/editor-confirm.mjs` before the checks. It lists the commits since the last record commit
   (`chore: record editor saves as in step [skip ci]`), along every parent so that a save merged in by a plain
   `git pull` is seen too, skips developer and merge commits, and takes every editor save among them. For each one it
   records as in step (in `content-sync.json`) only the pages and fields whose value that save changed, with the whole
   value they had after the save. So a save is not lost when its run is cancelled by a developer push, the Monday run
   or the next save: the next run picks it up. Pages and fields the editor did not change keep the strict rule, even in
   a file an editor also saved, and a key a developer confirmed after the save keeps the developer's record. When there
   were editor saves, it also regenerates `faculty/*.md`.
2. runs all the checks and the build as for any commit. A save that breaks a rule stops here and is not published;
   the site keeps the previous version. For example: a passed date marked open, an unexplained acronym, a language
   left empty, or, in a programme, contact or partner fact, numbers that differ between the two languages.
3. deploys the site, and, only when the editor step found saves to record, the separate job `record-editor-sync`
   commits the record to `main`. It is the only job with write access and it records from the newest `main` (so saves
   that arrived meanwhile are included). A running record job is not cancelled by a newer run; one still waiting to
   start is replaced by the newer run's, which records the same saves and any newer ones, so nothing is lost.

**Limits:**

- A save is trusted as checked in both languages. If someone changes only the Japanese, the English is recorded as
  still saying the same thing. The office's guide asks staff to read both languages before saving.
- The numbers check catches a difference only in programme, contact and partner facts; it does not read page texts
  or news items.
- A save records the whole value of what it changed. If a developer changed the English of a page without confirming
  it and an editor then saves the Japanese of the same page, the developer's change is recorded as in step with it.
  The same holds for the two languages of one data field.
- A developer confirmation that leaves the registry entry as it was cannot be told from no confirmation, so a later
  editor save of that key records its own value as usual.
- The walk looks at every commit since the last record commit that the workflow's clone holds (the 51 newest commits
  on `main`), along every parent; when no record commit is in the clone yet, it looks at the 50 newest. A save older
  than that, or one whose parent is outside the clone, is left unrecorded; the check then reports it, and a developer
  confirms it by hand.

**Repository rules:** saves and the record commit push straight to `main`. Two rulesets (Settings > Rules >
Rulesets) block force pushes and deletion, as the Additions security checklist recommends, with nobody on their bypass
list, the app included: "Protect main (editing page)" for `main` and "Protect tags (editing page)" for all tags. Do
not require a pull request on `main`, or every save will be refused.

## Where the editing page lives

The editing page is published only on GitHub Pages, before and after launch. Editors always use the GitHub Pages
address. The reason is the sign-in: the editor keeps its sign-in token in the browser's storage for the page's host,
and every page on the same host can read that storage. On GitHub Pages the host is `basilechretien.github.io` now,
shared only with the developer's other Pages sites, and `<organisation>.github.io` after the move; on the faculty
server it would be all of `www.med.nagoya-u.ac.jp`.

- The **Build for the faculty server** workflow leaves `admin/` out of the zip. Any other way of sending the build to
  the server (a fetch job, SFTP) must leave it out too (`docs/launch.md`).
- The allowed domains list only the GitHub Pages host (step 4).
- `site_url` in `config.yml` is only the "view site" link: it may point to the faculty server after launch.
- The page stays `noindex`, out of the sitemap and out of the site search.

## What the editing page loads

The editor's code is served from the site itself: `scripts/copy-editor.mjs` copies `dist/sveltia-cms.js` and
`dist/chunks/` of the devDependency `@sveltia/cms` (pinned to an exact version in `package.json`) into
`public/admin/cms/` before every build. Dependabot proposes new versions monthly, checked like any update. The
content check makes sure the built page finds its script.

Sveltia CMS still fetches some things from other sites while it runs, according to its code:

- the interface translations other than English (for example `ja.json`), from `unpkg.com/@sveltia/cms@<version>/locales`;
- its fonts, from `cdn.jsdelivr.net`;
- syntax-highlighting modules from `unpkg.com` (`@sveltia/ui`, `@shikijs`) when it highlights code, and the map
  library for map fields, which this configuration does not use;
- the latest version number from `unpkg.com`, to show an update notice;
- a chunk from `unpkg.com` only if the copy next to the script cannot be loaded.

These requests fetch files from fixed, versioned addresses (the update check excepted); they are not where the
editor sends its content, which goes to GitHub, or its sign-in, which goes to the sign-in service. Visitor pages load
nothing from other sites, as before.

## Keeping it running

- Where the service runs: the Worker `sveltia-cms-additions` on the developer's own Cloudflare account, deployed from
  the configuration repository `BasileChretien/sveltia-cms-additions`. Cloudflare's GitHub app needs access to that
  repository only; the site's own GitHub App, made by the wizard, to this repository only. Before the developer
  leaves, set the service up again on the office's Cloudflare account (steps 1 to 5) and change `base_url`. A new
  deploy starts empty, so the wizard and the user accounts are done again. When the new service works, remove the
  old one, or it stays a second way to write to `main`: delete the first GitHub App (GitHub > Settings > Developer
  settings > GitHub Apps > the app > Advanced > Delete GitHub App, which also removes it from the repository), delete
  the old Worker (Workers & Pages > the Worker > Settings > Delete), and delete the old configuration repository or
  hand it over.
- Sveltia CMS: merge the Dependabot pull request for `@sveltia/cms` after its checks pass, then open the editing page
  once to see that it starts.
- Additions: when a new version comes out, the Administration page shows a notice, and Dependabot opens a pull
  request in the configuration repository that the Deploy button created. Merge it; Workers Builds deploys it.
- A lost admin secret: set a new one in the Cloudflare dashboard and choose **Start Over** in the wizard (everyone is
  signed out and the GitHub App's private key must be uploaded again). See the setup page.
- When a data file's fields change (`src/content.config.ts`), change `public/admin/config.yml` in the same change.
  The content check `editor-config` fails when a folder or file named there is missing, when a field (nested object
  fields included) is not a property of the collection's schema in `src/content.config.ts`, when a top-level field of
  a data file is in none of its entries, or when a page field has no `i18n` setting. It reads the schema's property
  names only, not their depth or types.
