#!/usr/bin/env node
/**
 * Tests for the weekly check (scripts/external-lib.mjs), the structured-data check (scripts/structured-lib.mjs) and
 * the calendar files (src/lib/calendar.ts, loaded through Node's type stripping).
 * No network: requests go to a fake fetch. Run: node scripts/test-tools.mjs
 */
import { spawnSync } from 'node:child_process';
import { externalLinks, verdict, checkAll, limiter, weeklyReport, OWN_HOST, ISSUE_LIMIT, inArea, protectedVerdict, checkProtected, usableAreas } from './external-lib.mjs';
import { structuredData, missingTypes } from './structured-lib.mjs';
import { outsideResources, outsideInCss, outsideLinks, isOutside, cssAddressesByPattern, loadedAddresses, isPageRelative, servedAt } from './resources-lib.mjs';
import { programmeDeadline, newsEntry, icsText, shownStatus } from '../src/lib/calendar.ts';

let failed = 0;
let total = 0;
const say = (ok, name, why = '') => { total += 1; process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}${why && !ok ? ` (${why})` : ''}\n`); if (!ok) failed += 1; };
const SELF = 'https://example.github.io/site/';

// Outside links: markup only, own pages and look-alike attributes left out, entities decoded, fragments dropped.
{
  const html = `<a href="https://a.org/x?p=1&amp;q=2#top">A</a> <img src="https://b.org/i.png"> <a data-href="https://c.org/">C</a>
    <link rel="canonical" href="${SELF}en/"> <a href="/site/en/about/">own</a> <a href="mailto:x@y.z">mail</a>
    <script>const u = "https://d.org/";</script> <a href="http://e.org/">E</a>`;
  const got = externalLinks(html, SELF);
  const want = ['https://a.org/x?p=1&q=2', 'https://b.org/i.png', 'http://e.org/'];
  say(JSON.stringify(got) === JSON.stringify(want), 'outside links are read from the markup only, without own pages or fragments', JSON.stringify(got));
  // What visitors without JavaScript get is checked too, and a script's own address is a link to check.
  const fallback = externalLinks('<noscript><a href="https://n.example/page">menu</a></noscript><script src="https://s.example/x.js"></script>');
  say(JSON.stringify(fallback.sort()) === JSON.stringify(['https://n.example/page', 'https://s.example/x.js']), 'links inside <noscript> and script addresses are read', JSON.stringify(fallback));
  // Review of #22: SVG xlink:href and links inside <template> are checked too, as documented.
  const svg = externalLinks('<svg><use xlink:href="https://x.example/s.svg#i"/></svg><template><a href="https://t.example/">t</a></template>');
  say(JSON.stringify(svg.sort()) === JSON.stringify(['https://t.example/', 'https://x.example/s.svg']), 'SVG xlink:href and links inside <template> are read', JSON.stringify(svg));
}

// Verdicts follow the audit: gone or refused by the faculty's server is broken; a refusal elsewhere is unverified.
{
  const cases = [
    [{ url: 'https://a.org/', status: 404 }, 'broken'],
    [{ url: 'https://a.org/', status: 410 }, 'broken'],
    [{ url: 'https://a.org/', status: 401 }, 'broken'],
    [{ url: `https://${OWN_HOST}/x`, status: 403 }, 'broken'],
    [{ url: 'https://a.org/', status: 403 }, 'unverified'],
    [{ url: 'https://a.org/', status: 429 }, 'unverified'],
    [{ url: 'https://a.org/', status: 503 }, 'unverified'],
    [{ url: 'https://a.org/', status: null, error: 'TypeError: ENOTFOUND' }, 'broken'],
    [{ url: 'https://a.org/', status: null, error: 'TimeoutError: The operation was aborted' }, 'unverified'],
    [{ url: 'https://a.org/', status: null, error: 'TypeError: EAI_AGAIN' }, 'unverified'],
    [{ url: 'https://a.org/', status: 200 }, 'ok'],
    [{ url: 'https://a.org/', status: 301 }, 'ok'],
  ];
  const wrong = cases.filter(([rec, want]) => verdict(rec) !== want).map(([rec, want]) => `${rec.status ?? rec.error} gave ${verdict(rec)}, not ${want}`);
  say(wrong.length === 0, 'verdicts follow the audit rules', wrong.join('; '));
}

// No more than n tasks run at once.
{
  const run = limiter(2);
  let now = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: 6 }, () => run(async () => {
    now += 1; peak = Math.max(peak, now);
    await new Promise((r) => setTimeout(r, 5));
    now -= 1;
  })));
  say(peak === 2, 'the limiter runs at most n tasks at once', `peak ${peak}`);
}

// One request at a time per host; HEAD refused means GET; errors become results, not crashes.
{
  const active = new Map();
  let overlap = false;
  const calls = [];
  const fakeFetch = async (url, init) => {
    const host = new URL(url).hostname;
    calls.push(`${init.method} ${url}`);
    if (active.get(host)) overlap = true;
    active.set(host, true);
    await new Promise((r) => setTimeout(r, 3));
    active.set(host, false);
    if (host === 'gone.example') {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'ENOTFOUND' };
      throw err;
    }
    const status = url.endsWith('/nohead') && init.method === 'HEAD' ? 405 : 200;
    return { status, url, body: { cancel: async () => {} } };
  };
  const urls = ['https://a.example/1', 'https://a.example/2', 'https://a.example/3', 'https://b.example/nohead', 'https://gone.example/'];
  const results = await checkAll(urls, { concurrency: 4, fetchImpl: fakeFetch, pause: () => 0 });
  const byUrl = Object.fromEntries(results.map((r) => [r.url, r]));
  say(!overlap, 'requests to one host never overlap');
  say(calls.includes('GET https://b.example/nohead') && byUrl['https://b.example/nohead'].status === 200, 'a refused HEAD is retried with GET');
  say(byUrl['https://gone.example/'].status === null && verdict(byUrl['https://gone.example/']) === 'broken', 'a host that does not exist is reported broken, without a crash', JSON.stringify(byUrl['https://gone.example/']));
  say(results.length === urls.length && results.every((r, i) => r.url === urls[i]), 'every address gets one result, in order');
}

// The report needs a person only for broken links or content check findings, not for sites that refuse checks.
{
  const base = { checked: '2026-11-30', content: { code: 0, output: '39 English and 39 Japanese pages; 0 errors, 0 warnings.' } };
  const onlyRefused = weeklyReport({ ...base, results: [{ url: 'https://a.org/', status: 403, places: ['/en/'] }] });
  say(!onlyRefused.problems && /Could not be checked \(1\)/.test(onlyRefused.markdown), 'a site that refuses automated checks is listed without opening an issue');
  const brokenOne = weeklyReport({ ...base, results: [{ url: 'https://a.org/x|y', status: 404, places: ['/en/', '/ja/', '/en/a/', '/en/b/'] }] });
  say(brokenOne.problems && /\| https:\/\/a\.org\/x\\\|y \| 404 \| `\/en\/`, `\/ja\/`, `\/en\/a\/` and 1 more \|/.test(brokenOne.markdown), 'a broken link opens an issue, with its pages and a safe table cell', brokenOne.markdown);
  const deadline = weeklyReport({ ...base, results: [], content: { code: 0, output: 'warning: programmes/x.json: deadline 2026-01-01 has passed\n' } });
  say(deadline.problems && /- warning: programmes\/x\.json: deadline 2026-01-01 has passed/.test(deadline.markdown), 'a passed deadline found by the content checks opens an issue');
  const many = weeklyReport({ ...base, results: Array.from({ length: 100 }, (_, i) => ({ url: `https://a.org/${i}`, status: 404, places: ['/en/'] })) });
  say(/… and 20 more/.test(many.markdown), 'a long list is cut, and says how many are left out');
  say(!/Password-protected areas/.test(onlyRefused.markdown), 'with no protected area, the report has no section for them');
}

// Password-protected areas (src/data/protected-areas.json): the area, its address without the final slash and
// anything under it belong to it; nothing else does.
{
  const areas = [{ url: 'https://www.med.nagoya-u.ac.jp/intlexch/japanese/alumni/' }];
  const cases = [
    ['https://www.med.nagoya-u.ac.jp/intlexch/japanese/alumni/', true],
    ['https://www.med.nagoya-u.ac.jp/intlexch/japanese/alumni', true],
    ['https://www.med.nagoya-u.ac.jp/intlexch/japanese/alumni/index.html', true],
    ['https://www.med.nagoya-u.ac.jp/intlexch/japanese/alumnifake/', false],
    ['https://www.med.nagoya-u.ac.jp/intlexch/japanese/', false],
    // Written another way, the same address still belongs to the area (review round 1).
    ['http://www.med.nagoya-u.ac.jp/intlexch/japanese/alumni/', true],
    ['https://WWW.MED.NAGOYA-U.AC.JP/intlexch/japanese/alumni/', true],
    ['https://www.med.nagoya-u.ac.jp:443/intlexch/japanese/alumni/', true],
    ['https://www.med.nagoya-u.ac.jp:8443/intlexch/japanese/alumni/', false],
    ['https://other.example/intlexch/japanese/alumni/', false],
    ['mailto:someone@example.org', false],
    ['not an address', false],
  ];
  const wrong = cases.filter(([url, want]) => inArea(url, areas) !== want).map(([url]) => url);
  say(wrong.length === 0, 'an address belongs to a protected area only when it is the area or under it, however its scheme, host case or default port is written', wrong.join('; '));
  const usable = usableAreas([{ id: 'ok', url: 'https://x.example/m/' }, { id: 'no-url' }, { url: 'https://x.example/n/' }, { id: 'http', url: 'http://x.example/m/' }, null, 'text']);
  say(usable.length === 1 && usable[0].id === 'ok', 'only entries with an id and a full https address are checked; the others are skipped, not a crash', JSON.stringify(usable));
  say(usableAreas({}).length === 0, 'a protected-areas file that is not a list gives no areas instead of a crash');
}

// A protected area must keep asking for a password; anything else is named for what it means.
{
  const cases = [
    [{ status: 401, auth: 'Basic realm="Input ID and Password."' }, 'protected'],
    [{ status: 401, auth: null }, 'unverified'],
    [{ status: 200 }, 'open'],
    [{ status: 302 }, 'moved'],
    [{ status: 301 }, 'moved'],
    [{ status: 404 }, 'missing'],
    [{ status: 410 }, 'missing'],
    [{ status: 500 }, 'unverified'],
    [{ status: null, error: 'TimeoutError' }, 'unverified'],
  ];
  const wrong = cases.filter(([rec, want]) => protectedVerdict(rec) !== want).map(([rec, want]) => `${rec.status} gave ${protectedVerdict(rec)}, not ${want}`);
  say(wrong.length === 0, 'protected-area verdicts: a password prompt is protected; an answer, a redirect or a missing page is not', wrong.join('; '));
}

// The protected areas are asked for without following redirects, and an error is a result, not a crash.
{
  const seen = [];
  const headers = (h) => ({ get: (k) => h[k.toLowerCase()] ?? null });
  const fakeFetch = async (url, init) => {
    seen.push(init.redirect);
    if (url.includes('gone')) { const e = new TypeError('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; }
    if (url.includes('moved')) return { status: 302, headers: headers({ location: 'https://x.example/ja/' }), body: { cancel: async () => {} } };
    return { status: 401, headers: headers({ 'www-authenticate': 'Basic realm="x"' }), body: { cancel: async () => {} } };
  };
  const areas = [
    { id: 'a', url: 'https://x.example/members/', name: { en: 'Members' } },
    { id: 'b', url: 'https://x.example/moved/', name: { en: 'Moved' } },
    { id: 'c', url: 'https://gone.example/m/' },
  ];
  const res = await checkProtected(areas, { fetchImpl: fakeFetch });
  say(seen.every((r) => r === 'manual'), 'protected areas are asked for without following redirects', seen.join(','));
  say(protectedVerdict(res[0]) === 'protected' && res[0].name === 'Members', 'a password prompt is read with its header', JSON.stringify(res[0]));
  say(protectedVerdict(res[1]) === 'moved' && res[1].location === 'https://x.example/ja/', 'a redirect is reported with where it leads', JSON.stringify(res[1]));
  say(res[2].status === null && /ECONNRESET/.test(res[2].error) && res[2].name === 'c', 'a failed request is a result, named by its id when it has no name', JSON.stringify(res[2]));
}

// The weekly report: a protected area that answers, moves or is gone opens an issue; one that asks for a password,
// or that could not be checked, does not.
{
  const base = { checked: '2026-11-30', results: [], content: { code: 0, output: '' } };
  const area = (rec) => ({ url: 'https://x.example/members/', name: 'Frontier-kai members\' area', ...rec });
  const fine = weeklyReport({ ...base, areas: [area({ status: 401, auth: 'Basic realm="x"' })] });
  say(!fine.problems && /## Password-protected areas/.test(fine.markdown) && /Asks for a password, as it should\./.test(fine.markdown), 'a protected area that asks for a password is listed as fine, without an issue', fine.markdown);
  say(/cannot see a redirect that the server applies only after a member signs in/.test(fine.markdown), 'the report says what the check cannot see (a redirect applied after sign-in)');
  const open = weeklyReport({ ...base, areas: [area({ status: 200 })] });
  say(open.problems && /Answers without a password/.test(open.markdown), 'a protected area that answers without a password opens an issue');
  const moved = weeklyReport({ ...base, areas: [area({ status: 302, location: 'https://x.example/ja/' })] });
  say(moved.problems && /Sends visitors to https:\/\/x\.example\/ja\//.test(moved.markdown), 'a protected area that redirects opens an issue and says where it leads');
  const missing = weeklyReport({ ...base, areas: [area({ status: 404 })] });
  say(missing.problems && /Not found/.test(missing.markdown), 'a protected area that is gone opens an issue');
  const unknown = weeklyReport({ ...base, areas: [area({ status: null, error: 'TimeoutError: aborted' })] });
  say(!unknown.problems && /Could not be checked \(TimeoutError: aborted\)/.test(unknown.markdown), 'a protected area that could not be checked is listed without an issue');
}

// Structured data: valid blocks pass; bad JSON, a missing type or context, and a relative address are reported.
{
  const block = (o) => `<script type="application/ld+json">${typeof o === 'string' ? o : JSON.stringify(o)}</script>`;
  const good = block({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.github.io/site/en/' }] });
  say(structuredData(good).problems.length === 0 && structuredData(good).blocks.length === 1, 'well-formed structured data passes', structuredData(good).problems.join('; '));
  say(structuredData(block('{"@type": ')).problems.some((p) => /not valid JSON/.test(p)), 'structured data that does not parse is reported');
  say(structuredData(block({ '@context': 'https://schema.org' })).problems.some((p) => /"@type"/.test(p)), 'structured data without a type is reported');
  say(structuredData(block({ '@type': 'Thing' })).problems.some((p) => /@context/.test(p)), 'structured data without the schema.org context is reported');
  const rel = block({ '@context': 'https://schema.org', '@type': 'EducationalOccupationalProgram', url: '/site/en/degrees/', provider: { '@type': 'CollegeOrUniversity', url: 'http://x.org/' } });
  say(structuredData(rel).problems.length === 2, 'relative and plain-http addresses in structured data are reported', structuredData(rel).problems.join('; '));
}

// Calendar files: only coming dates, all-day entries that end the day after, deadlines named as such.
{
  const prog = (deadline) => ({ id: 'jdp-x', data: { name: { en: 'Joint degree X', ja: 'X' }, short: { en: 'JD X', ja: 'X' }, deadline } });
  const TODAY = '2026-11-26';
  const open = programmeDeadline(prog({ status: 'open', date: '2027-01-15', text: { en: 'Apply by 15 January', ja: '1月15日まで' } }), 'en', 'https://x/en/degrees/x/', TODAY);
  say(open?.title === 'Deadline: JD X' && open.start === '2027-01-15' && open.end === '2027-01-15', 'an open programme deadline with a coming date becomes an entry', JSON.stringify(open));
  say(programmeDeadline(prog({ status: 'tba', date: '2027-01-15', text: { en: '', ja: '' } }), 'en', '', TODAY) === null, 'a deadline not yet announced gets no entry, even with a date');
  say(programmeDeadline(prog({ status: 'open', date: '2026-11-25', text: { en: '', ja: '' } }), 'en', '', TODAY) === null, 'a passed deadline gets no entry');
  say(programmeDeadline(prog({ status: 'open', text: { en: '', ja: '' } }), 'en', '', TODAY) === null, 'a deadline without a date gets no entry');
  // As src/pages/[lang]/news/_news.ts builds it: `until` falls back to the date; the data's own `until` may be absent.
  const news = (category, date, until) => ({ id: `n-${category}`, until: until ?? date, entry: { data: { category, date, until, title: { en: 'Call for students', ja: '学生募集' } } } });
  const call = newsEntry(news('call', '2026-11-20', '2026-12-10'), 'ja', 'https://x/ja/news/n/', TODAY);
  say(call?.title === '締切: 学生募集' && call.start === '2026-12-10' && call.end === '2026-12-10', 'a call with a deadline becomes an entry on its deadline', JSON.stringify(call));
  say(newsEntry(news('call', '2026-11-26'), 'en', '', TODAY) === null, 'a call with no deadline gets no entry, not one on its publication day');
  const sameDay = newsEntry(news('call', '2026-11-26', '2026-11-26'), 'en', '', TODAY);
  say(sameDay?.title === 'Deadline: Call for students' && sameDay.start === '2026-11-26', 'a call due on its publication day is still labelled as a deadline', JSON.stringify(sameDay));
  const event = newsEntry(news('event', '2026-12-01', '2026-12-03'), 'en', 'https://x/en/news/n/', TODAY);
  say(event?.title === 'Call for students' && event.start === '2026-12-01' && event.end === '2026-12-03', 'an event keeps its first and last day');
  say(newsEntry(news('news', '2026-12-01'), 'en', '', TODAY) === null && newsEntry(news('event', '2026-11-01'), 'en', '', TODAY) === null, 'plain news and past events get no entry');
  const text = icsText([open, { ...event, title: '国際シンポジウム, 名古屋; 2日目' }], 'Test calendar');
  say(/DTSTART;VALUE=DATE:20270115/.test(text) && /DTEND;VALUE=DATE:20270116/.test(text), 'entries are all-day and end the day after their last day');
  say(/UID:deadline-jdp-x-2027-01-15@/.test(text) && /X-WR-CALNAME:Test calendar/.test(text) && /\r\n/.test(text), 'entries have a stable UID, the calendar its name, lines end with CRLF');
  const unfolded = text.replace(/\r\n[ \t]/g, '');
  say(unfolded.includes('SUMMARY:国際シンポジウム\\, 名古屋\\; 2日目'), 'commas and semicolons in titles are escaped', unfolded);
  say(/END:VCALENDAR/.test(icsText([], 'Empty')), 'a calendar with no coming dates is still a valid file');
  const shown = [
    shownStatus({ status: 'open', date: '2026-11-25' }, TODAY),
    shownStatus({ status: 'open', date: '2026-11-26' }, TODAY),
    shownStatus({ status: 'open' }, TODAY),
    shownStatus({ status: 'rolling', date: '2026-01-01' }, TODAY),
  ];
  say(JSON.stringify(shown) === JSON.stringify(['closed', 'open', 'open', 'rolling']), 'a passed open deadline is shown as closed; a deadline due today is still open', JSON.stringify(shown));
}

// Nothing loaded from other sites: images, scripts, stylesheets, fonts and frames count; clicked links and the
// canonical and language links do not.
{
  const page = `<link rel="canonical" href="https://example.github.io/site/en/"><link rel="alternate" hreflang="ja" href="https://example.github.io/site/ja/">
    <link rel="stylesheet" href="https://fonts.example.com/css"><link href="//cdn.example.com/x.css" rel="preload">
    <img alt="" src="/site/img/a.webp"><img alt="" src="https://img.example.com/b.png"><img alt="" srcset="/a.webp 1x, https://img.example.com/c.png 2x">
    <script async src="https://track.example.com/t.js"></script><iframe src="https://maps.example.com/embed"></iframe>
    <a href="https://www.med.nagoya-u.ac.jp/">a link</a><div style="background:url('https://img.example.com/bg.png')"></div>`;
  const got = outsideResources(page).sort();
  const want = ['//cdn.example.com/x.css', 'https://fonts.example.com/css', 'https://img.example.com/b.png', 'https://img.example.com/bg.png', 'https://img.example.com/c.png', 'https://maps.example.com/embed', 'https://track.example.com/t.js'];
  say(JSON.stringify(got) === JSON.stringify(want), 'resources loaded from other sites are found; clicked, canonical and language links are not', JSON.stringify(got));
  // Recorded on #19: @import, entity quotes, SVG links, imagesrcset; and the site's own host is not another site.
  const more = `<style>@import "https://x.example/a.css"; .a { color: red }</style>
    <div style="background:url(&quot;https://img.example.com/q.png&quot;)"></div>
    <svg><image href="https://svg.example/i.png"></image><use xlink:href="https://svg.example/s.svg#a"></use><use href="#local"></use></svg>
    <link rel="preload" as="image" href="/site/a.webp" imagesrcset="/site/a.webp 1x, https://img.example.com/r.png 2x">
    <img alt="" src="https://example.github.io/site/own.webp"><img alt="" src="//example.github.io/site/own2.webp">`;
  const OWN = ['https://example.github.io/site/'];
  const got2 = outsideResources(more, OWN).sort();
  const want2 = ['https://img.example.com/q.png', 'https://img.example.com/r.png', 'https://svg.example/i.png', 'https://svg.example/s.svg#a', 'https://x.example/a.css'];
  say(JSON.stringify(got2) === JSON.stringify(want2), '@import, entity-quoted url(), SVG links and imagesrcset are found; the site\'s own addresses are not another site', JSON.stringify(got2));
  const css = '@font-face{font-family:F;src:url(https://fonts.example.com/f.woff2) format("woff2")}@import url("//cdn.example.com/b.css");.x{background:url(/site/img/a.webp)}';
  const got3 = outsideInCss(css, OWN).sort();
  say(JSON.stringify(got3) === JSON.stringify(['//cdn.example.com/b.css', 'https://fonts.example.com/f.woff2']), 'fonts and imports from other sites are found in a built stylesheet; its own files are not', JSON.stringify(got3));
  // Blocking item of the #20 review: minified CSS writes @import without a space.
  const minified = outsideInCss('@import"https://x.example/a.css";@import \'https://x.example/b.css\';.y{color:red}');
  say(JSON.stringify(minified) === JSON.stringify(['https://x.example/a.css', 'https://x.example/b.css']), 'an @import with no space after it, as minified CSS writes it, is found', JSON.stringify(minified));
  // Recorded on #20: single-quoted style attributes, numeric entities, another project on the same host, an
  // @import address holding the other quote, and a comment before the address.
  const page20 = `<div style='background:url(https://img.example.com/single.png)'></div>
    <div style="background:url(&#x22;https://img.example.com/hex.png&#x22;)"></div><div style="background:url(&#34;https://img.example.com/dec.png&#34;)"></div>
    <script src="https://example.github.io/other-project/x.js"></script><img alt="" src="http://example.github.io/site/own-http.webp">`;
  const got4 = outsideResources(page20, OWN).sort();
  const want4 = ['https://example.github.io/other-project/x.js', 'https://img.example.com/dec.png', 'https://img.example.com/hex.png', 'https://img.example.com/single.png'];
  say(JSON.stringify(got4) === JSON.stringify(want4), 'single-quoted styles and numeric entities are read; another project on the same host is outside; the site itself over http is not', JSON.stringify(got4));
  const css20 = outsideInCss('@import "https://x.example/a\'b.css";@import/**/"https://x.example/c.css";@import /* note */ \'https://x.example/d"e.css\';');
  say(JSON.stringify(css20) === JSON.stringify(['https://x.example/a\'b.css', 'https://x.example/c.css', 'https://x.example/d"e.css']), 'an @import address holding the other quote, or after a comment, is found', JSON.stringify(css20));
  // Recorded on #21, now read by the parsers: an entity beyond Unicode does not stop the check; host case, default
  // ports and ".." segments are read as a browser reads them; a "/*" inside a string does not hide what follows.
  let huge;
  try { huge = outsideResources('<img alt="" src="&#x110000;"><div style="a:&#99999999;"></div>', OWN); } catch (e) { huge = e; }
  say(Array.isArray(huge) && huge.length === 0, 'an entity beyond Unicode does not stop the check', String(huge));
  const own21 = [
    isOutside('https://Example.github.io/site/a.png', OWN),
    isOutside('https://example.github.io:443/site/a.png', OWN),
    isOutside('https://example.github.io/site/../other-project/x.js', OWN),
  ];
  say(JSON.stringify(own21) === '[false,false,true]', 'host case and default ports are the site\'s own; ".." that leaves the site is outside', JSON.stringify(own21));
  const strings = outsideInCss('.a{content:"/*"}@import "https://x.example/a.css";.b{content:"*/"}');
  say(JSON.stringify(strings) === '["https://x.example/a.css"]', 'a comment sign inside a CSS string does not hide the addresses after it', JSON.stringify(strings));
  // Review of #22 (blocking): a url() inside a custom property, in a stylesheet or a style attribute.
  const custom = [
    ...outsideInCss(':root{--hero:url(https://cdn.example/h.jpg)}.a{background:var(--hero)}', OWN),
    ...outsideResources('<div style="--bg:url(https://x.example/a.png)"></div>', OWN),
  ];
  say(JSON.stringify(custom) === JSON.stringify(['https://cdn.example/h.jpg', 'https://x.example/a.png']), 'a url() inside a CSS custom property is found', JSON.stringify(custom));
  // Review of #22: backslashes read as slashes, as browsers do; inline data loads nothing from another site.
  const resolved = [
    isOutside('/\\evil.example/x.js', OWN),
    isOutside('\\\\evil.example/x.js', OWN),
    isOutside('data:image/png;base64,AAAA', OWN),
    isOutside('/site/img/a.webp', OWN),
  ];
  say(JSON.stringify(resolved) === '[true,true,false,false]', 'an address with backslashes is read as a browser reads it; inline data and the site\'s own files are not outside', JSON.stringify(resolved));
  // Review of #22: a stylesheet css-tree cannot read is still scanned by simple patterns.
  const fallbackCss = cssAddressesByPattern('@import"https://x.example/a.css";.a{background:url( "https://img.example/b.png" )}');
  say(JSON.stringify(fallbackCss) === JSON.stringify(['https://img.example/b.png', 'https://x.example/a.css']), 'the fallback scan of an unreadable stylesheet finds url() and @import addresses', JSON.stringify(fallbackCss));
  // Fix round of #22: outsideInCss itself falls back when the parser throws, and keeps only outside addresses.
  const failing = () => { throw new Error('cannot read'); };
  const viaFallback = outsideInCss('@import"https://x.example/a.css";.a{background:url(/site/img/own.webp)}', OWN, { parse: failing });
  say(JSON.stringify(viaFallback) === '["https://x.example/a.css"]', 'when the CSS parser fails, the stylesheet is still scanned and its outside addresses reported', JSON.stringify(viaFallback));
  // Fix round of #22: relative addresses are read against the page or stylesheet that holds them, as a browser does.
  const pageBase = 'https://example.github.io/site/en/about/';
  const relativeOwn = [
    ...outsideResources('<img alt="" srcset="../a.webp 2x" src="/site/b.webp">', OWN, pageBase),
    ...outsideInCss('.x{background:url(../img/a.png)}', OWN, { base: 'https://example.github.io/site/_astro/x.css' }),
  ];
  const relativeOut = outsideResources('<img alt="" srcset="../../../other/a.webp 2x">', OWN, pageBase);
  say(relativeOwn.length === 0 && JSON.stringify(relativeOut) === '["../../../other/a.webp"]', 'relative addresses are read against their page or stylesheet: inside the site they are its own, above it they are outside', JSON.stringify([relativeOwn, relativeOut]));
  // Round 3 of #22: the page's address also reaches <style> blocks and style attributes.
  const styled = outsideResources('<style>.a{background:url(../a.png)}</style><div style="background:url(../b.png)"></div>', OWN, pageBase);
  const styledOut = outsideResources('<style>.a{background:url(../../../x/a.png)}</style>', OWN, pageBase);
  say(styled.length === 0 && styledOut.length === 1, 'relative addresses in <style> blocks and style attributes are read against the page', JSON.stringify([styled, styledOut]));
  // Round 3 of #22: where a built file is served, with each path segment kept as a name.
  const served = [
    servedAt('en/about/index.html', 'https://example.github.io/site/'),
    servedAt('index.html', 'https://example.github.io/site/'),
    servedAt('_astro/x.css', 'https://example.github.io/site/'),
    servedAt('a#b/c%d/index.html', 'https://example.github.io/site/'),
    servedAt('en/index.html', undefined),
  ];
  const wantServed = ['https://example.github.io/site/en/about/', 'https://example.github.io/site/', 'https://example.github.io/site/_astro/x.css', 'https://example.github.io/site/a%23b/c%25d/', undefined];
  say(JSON.stringify(served) === JSON.stringify(wantServed), 'a built file is served at its folder (index.html) or its own address, with "#" and "%" kept in the path', JSON.stringify(served));
  // Round 3 of #22: the 404 page is shown at any address, so its page-relative addresses are found for the check to refuse.
  const notFound = loadedAddresses('<img alt="" srcset="../x.webp 2x" src="/site/a.webp"><div style="background:url(img/b.png)"></div><a href="../menu">menu</a>').filter(isPageRelative);
  say(JSON.stringify(notFound) === JSON.stringify(['../x.webp', 'img/b.png']), 'page-relative addresses a page loads are found; site-root addresses and plain links are not', JSON.stringify(notFound));
}

// Structured data that must be there: a page without its expected type is reported, whatever the attribute order.
{
  const page = '<script data-x="1" type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>';
  const { blocks } = structuredData(page);
  say(blocks.length === 1, 'a structured-data block with another attribute before its type is still read');
  say(JSON.stringify(missingTypes(blocks, ['BreadcrumbList'])) === '["BreadcrumbList"]' && missingTypes(blocks, ['WebPage']).length === 0, 'an expected type that is missing is reported');
  // Recorded on #19: a list of types, or types inside an @graph, count.
  const graph = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList","itemListElement":[]},{"@type":["EducationalOrganization","Organization"]}]}</script>';
  const g = structuredData(graph);
  say(g.problems.length === 0 && missingTypes(g.blocks, ['BreadcrumbList', 'EducationalOrganization']).length === 0, 'types given as a list or inside an @graph are found', JSON.stringify(g));
  // Recorded on #20: an empty @graph, or an item without a type, is reported; an address problem names its item's type.
  const block = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
  const empty = structuredData(block({ '@context': 'https://schema.org', '@graph': [] }));
  const untyped = structuredData(block({ '@context': 'https://schema.org', '@graph': [{ name: 'x' }] }));
  say(empty.problems.some((p) => /empty "@graph"/.test(p)) && untyped.problems.some((p) => /item 1 of the "@graph" has no "@type"/.test(p)), 'an empty @graph, or a graph item without a type, is reported', JSON.stringify([empty.problems, untyped.problems]));
  const relative = structuredData(block({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', url: '/x' }] }));
  say(relative.problems.length === 1 && /structured data WebPage: "url" is not a full https address: \/x/.test(relative.problems[0]), 'an address problem inside an @graph names the item\'s type', relative.problems.join('; '));
  // Recorded on #21: an item that only points at another by @id is valid JSON-LD.
  const reference = structuredData(block({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@id': 'https://example.org/#org' }] }));
  say(reference.problems.length === 0, 'a graph item that only refers to another item by @id is accepted', reference.problems.join('; '));
  // Parsed, not matched: a type attribute in upper case or single quotes still marks a block.
  const quoted = structuredData("<script type='Application/LD+JSON'>{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\"}</script>");
  say(quoted.blocks.length === 1, 'a structured-data block is found whatever the quoting and case of its type');
}

// Links from Markdown pages in every form: titled, in angle brackets, reference definitions and HTML.
{
  const md = [
    'A [plain](https://a.example/1) link and a [titled](https://a.example/2 "Title") one.',
    'An [angle](<https://a.example/3>) link, a [reference][r] and <a href="https://a.example/5">HTML</a>.',
    '',
    '[r]: https://a.example/4',
  ].join('\n');
  const got = (await outsideLinks(`${md}\nAn autolink <https://a.example/6>, and \`[code](https://a.example/7)\` that is not a link.\n`)).sort();
  say(JSON.stringify(got) === JSON.stringify(['https://a.example/1', 'https://a.example/2', 'https://a.example/3', 'https://a.example/4', 'https://a.example/5', 'https://a.example/6']), 'links in every Markdown and HTML form are found, and text in code is not a link', JSON.stringify(got));
}

// The weekly report shows a crashed content check, and stays within GitHub's issue size.
{
  const crash = weeklyReport({ checked: '2026-11-30', results: [], content: { code: 1, output: 'TypeError: x is not a function\n    at main (check-content.mjs:12)' } });
  say(crash.problems && /stopped with exit code 1/.test(crash.markdown) && /TypeError: x is not a function/.test(crash.markdown), 'a content check that crashed is shown with its exit code and last lines', crash.markdown);
  // Long addresses in both tables (each table shows 80 rows) and long warnings push the report past the limit.
  const many = Array.from({ length: 400 }, (_, i) => ({ url: `https://a.example/${'x'.repeat(320)}/${i}`, status: i % 2 ? 403 : 404, places: ['/en/a/', '/en/b/', '/en/c/'] }));
  const warnings = Array.from({ length: 900 }, (_, i) => `warning: programmes/p${i}.json: ${'y'.repeat(200)}`).join('\n');
  const long = weeklyReport({ checked: '2026-11-30', results: many, content: { code: 0, output: warnings } });
  say(long.markdown.length < ISSUE_LIMIT - 1000 && /too long for an issue/.test(long.markdown) && long.full.length > long.markdown.length, 'a very long report is cut to fit an issue and kept whole for the run summary', `${long.markdown.length} / ${long.full.length}`);
  // Recorded on #19: a cut inside the crash output's code block closes the block before the note.
  const fenced = weeklyReport({ checked: '2026-11-30', results: [], content: { code: 1, output: `TypeError: boom\n${'z'.repeat(80000)}` } });
  const fences = (fenced.markdown.match(/^```/gm) ?? []).length;
  say(fences % 2 === 0 && /```\n\n… The report was cut here/.test(fenced.markdown) && fenced.markdown.length < ISSUE_LIMIT, 'a cut inside a code block closes the block before the note', `${fences} fences`);
}

// The site's address (src/lib/address.mjs): GitHub Pages by default, another host from SITE_URL and BASE_PATH, and a
// plain error, not a broken build, for a value that cannot be right. Each case runs in its own process (the module
// reads the environment once).
{
  const ADDRESS = new URL('../src/lib/address.mjs', import.meta.url).href;
  const read = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', `import('${ADDRESS}').then((m) => console.log(JSON.stringify([m.SITE, m.BASE])))`], {
    encoding: 'utf8', env: { ...process.env, SITE_URL: undefined, BASE_PATH: undefined, ...env },
  });
  const clean = (env) => Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined));
  const byDefault = read({});
  say(byDefault.stdout.trim() === '["https://basilechretien.github.io","/nagoya-med-intl-prototype"]', 'the site is addressed at GitHub Pages by default', byDefault.stdout + byDefault.stderr);
  const faculty = spawnSync(process.execPath, ['--input-type=module', '-e', `import('${ADDRESS}').then((m) => console.log(JSON.stringify([m.SITE, m.BASE])))`], {
    encoding: 'utf8', env: clean({ ...process.env, SITE_URL: 'https://www.med.nagoya-u.ac.jp', BASE_PATH: '/intlexch' }),
  });
  say(faculty.stdout.trim() === '["https://www.med.nagoya-u.ac.jp","/intlexch"]', 'SITE_URL and BASE_PATH address the site at another host', faculty.stdout + faculty.stderr);
  const wrong = spawnSync(process.execPath, ['--input-type=module', '-e', `import('${ADDRESS}')`], {
    encoding: 'utf8', env: clean({ ...process.env, SITE_URL: 'https://www.med.nagoya-u.ac.jp/intlexch', BASE_PATH: 'intlexch/' }),
  });
  say(wrong.status !== 0 && /SITE_URL must be an https address with no path/.test(wrong.stderr), 'a site address with a path stops the build with a plain message', wrong.stderr.split('\n').find((l) => /Error/.test(l)) ?? '');
  // Review of #23: the host's root (an empty BASE_PATH) is accepted; a folder without its leading "/" is refused.
  const atRoot = spawnSync(process.execPath, ['--input-type=module', '-e', `import('${ADDRESS}').then((m) => console.log(JSON.stringify([m.SITE, m.BASE])))`], {
    encoding: 'utf8', env: clean({ ...process.env, SITE_URL: 'https://intl.example.ac.jp', BASE_PATH: '' }),
  });
  say(atRoot.stdout.trim() === '["https://intl.example.ac.jp",""]', 'an empty BASE_PATH puts the site at the root of its host', atRoot.stdout + atRoot.stderr);
  const noSlash = spawnSync(process.execPath, ['--input-type=module', '-e', `import('${ADDRESS}')`], {
    encoding: 'utf8', env: clean({ ...process.env, SITE_URL: 'https://www.med.nagoya-u.ac.jp', BASE_PATH: 'intlexch' }),
  });
  say(noSlash.status !== 0 && /BASE_PATH must be empty/.test(noSlash.stderr), 'a folder written without its leading "/" stops the build with a plain message', noSlash.stderr.split('\n').find((l) => /Error/.test(l)) ?? '');
}

process.stdout.write(`${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
