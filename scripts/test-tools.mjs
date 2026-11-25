#!/usr/bin/env node
/**
 * Tests for the weekly check (scripts/external-lib.mjs) and the structured-data check (scripts/structured-lib.mjs).
 * No network: requests go to a fake fetch. Run: node scripts/test-tools.mjs
 */
import { externalLinks, verdict, checkAll, limiter, weeklyReport, OWN_HOST } from './external-lib.mjs';
import { structuredData } from './structured-lib.mjs';

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

process.stdout.write(`${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
