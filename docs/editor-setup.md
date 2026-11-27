# Setting up the editing page

The site has an editing page for the office, at `<site>/admin/` (now
`https://basilechretien.github.io/nagoya-med-intl-prototype/admin/`). It is
[Sveltia CMS](https://sveltiacms.app/en/docs), a free editor (MIT licence) that works on top of this GitHub
repository: it shows forms instead of files, and every save becomes a commit on `main`. The office's guide, in
Japanese, is [editing-guide-ja.md](editing-guide-ja.md).

The editor itself needs no setup: `public/admin/index.html` loads it and `public/admin/config.yml` describes what
it edits. What is missing is the **sign-in**. This page sets it up once. Only the owner of the GitHub repository can
do it, because it installs a GitHub App on the repository. Allow about one hour.

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
limited to some files); GitHub Enterprise is not supported; it needs Sveltia CMS v0.271.0 or later (the page loads
the current version, so this is met).

## Before you start

1. **Decide who owns the repository.** The repository is now under a personal account. It should move to an
   account or organisation the office owns before the developer leaves, so the office keeps control of the site,
   the sign-in and the GitHub App. Moving it is simplest **before** this setup. If you move it later: change
   `repo:` in `public/admin/config.yml`, install the GitHub App on the moved repository (Administration page,
   GitHub section), and update the allowed domains and `site_url` if the site's address changes.
2. You need: the repository owner's GitHub account, and a free [Cloudflare](https://dash.cloudflare.com/sign-up)
   account (the office's, not a personal one). Turn on two-factor authentication on both.
3. Keep a password manager ready for the admin secret.

## Step 1. Deploy the service on Cloudflare

Follow [Additions setup, step 1](https://sveltiacms.app/en/docs/additions/setup):

1. On that page, click **Deploy to Cloudflare**. It copies a small configuration repository into your GitHub
   account, creates the storage and deploys the service with Workers Builds.
2. It asks for one value, `ADMIN_SECRET`. Create it with `openssl rand -base64 32` (at least 32 characters) and
   store it in the password manager. Whoever has it can create admin accounts.
3. In the Cloudflare dashboard, open **Workers & Pages**, select the new Worker, open **Domains** and turn on the
   **Production** `workers.dev` address if it is off. Note the address, for example
   `https://sveltia-cms-additions.<your-account>.workers.dev`.

## Step 2. Point the editor at the service

In `public/admin/config.yml`, under `backend:`, remove the `#` in front of the two lines and put the Worker's
address after `base_url:`:

```yaml
backend:
  name: github
  repo: BasileChretien/nagoya-med-intl-prototype
  branch: main
  auth_type: additions
  base_url: https://sveltia-cms-additions.<your-account>.workers.dev
```

Commit this like any developer change (through a pull request). Both keys are needed: `base_url` is required when
`auth_type` is `additions`. When the deploy has finished, the editing page shows a username and password form and
a **Use Admin Secret** button.

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
  older Authenticator): one host name per line. Now: `basilechretien.github.io`. After launch on the faculty
  server, add `www.med.nagoya-u.ac.jp`. Prefer exact host names to wildcards. Add `localhost` only while testing
  on your own computer, and remove it afterwards.
- **Allow signing in with GitHub**: leave it off. Staff sign in with a password.
- **Commit Author**: the default, "The person who made the change", records each save under the person's name.

## Step 5. Give each staff member access

In **Administration > Users**, add each person: a username (3 to 30 lowercase letters, digits, dots, hyphens or
underscores; it cannot be changed), their name, their work email if you want, and the role `editor`. The editor
shows a temporary password once; the **Email to** button opens your email app with the username, the password and
the sign-in link. At first sign-in the person chooses their own password (at least 12 characters).

A forgotten password: **Reset Password** in the person's menu gives a new temporary password. Someone leaves:
**disable** the account rather than deleting it. Keep at least two admins, so the office is not locked out.

## Step 6. Test with one harmless change

1. Sign in as an editor. Open **ページ：私たちについて / Pages: About us**, choose a page, and add a full stop at the
   end of the Japanese summary. Save.
2. In the repository, open the commit list of `main`: a commit `[editor] 更新：ページ「...」` has appeared. Open it
   and check that **only the summary line changed** in both language files. This is the one thing not yet tried
   on the live site: the documentation says other values are written back unchanged, but the YAML formatting of the
   front matter may be rewritten. If more than the edited line changed, tell the developer before staff start.
3. Open **Actions**: the "Check and deploy" run for that commit is green, its step "Record an editor save as in step
   in both languages" lists the page, and the job `record-editor-sync` has pushed a commit
   `chore: record both languages as in step after an editor save [skip ci]`.
4. After a few minutes the site shows the change. Remove the full stop the same way.
5. Repeat once with a programme (change the "checked" date and set it back) and once with a news item, and check the
   JSON diff in the same way.

## What happens after a save

Each save commits straight to `main` (the Simple workflow). The commit message starts with `[editor]`
(`backend.commit_messages` in `config.yml`). `.github/workflows/deploy.yml` then:

1. runs `scripts/editor-confirm.mjs` before the checks. It takes the editor commits at the top of `main`, lists the
   files they changed, and records as in step (in `content-sync.json`) only the pages and fields of those files that
   are out of step. It also regenerates `faculty/*.md`. Developer commits are not affected: they still need
   `npm run sync -- confirm`.
2. runs all the checks and the build as for any commit. A save that breaks a rule (numbers that differ between the
   two languages, a passed date marked open, an unexplained acronym, a missing language) stops here and is not
   published; the site keeps the previous version.
3. deploys the site, and the separate job `record-editor-sync` (the only one with write access) commits the
   updated `content-sync.json` and faculty texts back to `main` with `[skip ci]`.

**Limit:** a save is trusted as checked in both languages. If someone changes only the Japanese, the English is
recorded as still saying the same thing. The office's guide asks staff to check both languages before saving.

**Repository rules:** saves and the record commit push straight to `main`. Protect `main` against force pushes and
deletion (the Additions security checklist recommends it, with the app not on the bypass list), but do not require a
pull request on `main`, or every save will be refused.

## At launch on the faculty server

- Add `www.med.nagoya-u.ac.jp` to the allowed domains (step 4) and change `site_url` in `config.yml` to the new
  address.
- The editing page is part of the built site (`dist/admin/`), so it is served at `/intlexch/admin/` if the faculty
  server serves the build as it is. Saves still go to GitHub; the faculty server then fetches the new build.
- The page stays `noindex`, out of the sitemap and out of the site search. It is the only page that loads something
  from another site (the editor, from unpkg.com); the content check exempts it from that rule because it is for
  editors, not visitors.

## Keeping it running

- Sveltia CMS: the page loads the current version from unpkg.com, as its documentation advises; nothing to update.
- Additions: when a new version comes out, the Administration page shows a notice, and Dependabot opens a pull
  request in the configuration repository that the Deploy button created. Merge it; Workers Builds deploys it.
- A lost admin secret: set a new one in the Cloudflare dashboard and choose **Start Over** in the wizard (everyone is
  signed out and the GitHub App's private key must be uploaded again). See the setup page.
- When a data file's fields change (`src/content.config.ts`), change `public/admin/config.yml` in the same change.
  The content check `editor-config` fails when a folder or file named there is missing, when a field is in no entry
  of its data, or when a page field has no `i18n` setting.
