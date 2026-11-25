#!/usr/bin/env node
/**
 * Tests for the content-page plugin (src/lib/rehype-abbr.mjs), run through Sätteri, Astro's Markdown processor:
 * relative links rewritten from the file's folder, labels on links to the other language and to PDFs, acronyms
 * explained at their first use, and no crash on a link that cannot be read.
 * Run: node scripts/test-content-plugin.mjs
 */
import { markdownToHtml } from 'satteri';
import abbrPlugin from '../src/lib/rehype-abbr.mjs';

const BASE = '/nagoya-med-intl-prototype';
let failed = 0;
let total = 0;
const say = (ok, name, why = '') => { total += 1; process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}${why && !ok ? ` (${why})` : ''}\n`); if (!ok) failed += 1; };

/** Render Markdown as if it were the page src/content/pages/<file>. Returns the HTML, or the error thrown. */
async function render(md, file = 'en/degrees/adelaide.md') {
  const fileURL = new URL(`file:///C:/site/src/content/pages/${file}`);
  try {
    const r = await markdownToHtml(md, { fileURL, hastPlugins: [abbrPlugin({ base: BASE })] });
    return { html: String(r.html ?? r) };
  } catch (error) {
    return { error };
  }
}
const body = (html) => html.replace(/<aside class="abbrevs".*$/s, '');

// Links between pages are read from the file's folder, as CONTENT_GUIDE says.
{
  const { html } = await render('[A](admission) [B](../about/contact) [C](index) [D](faq#visa) [E](agreements?tag=x) [F](#top)');
  const want = [`${BASE}/en/degrees/admission/`, `${BASE}/en/about/contact/`, `${BASE}/en/degrees/`, `${BASE}/en/degrees/faq/#visa`, `${BASE}/en/degrees/agreements/?tag=x`, '#top'];
  const missing = want.filter((h) => !html.includes(`href="${h}"`));
  say(missing.length === 0, 'relative links become full addresses read from the file', missing.join(', '));
}

// Labels on links to the other language and to PDFs.
{
  const { html } = await render('[donation page](https://www.med.nagoya-u.ac.jp/medical_J/company/iagc/donation/) and [call (Japanese)](https://www.med.nagoya-u.ac.jp/medical_J/admission/)');
  say(/donation page \(Japanese\)<\/a>/.test(html) && !/\(Japanese\) \(Japanese\)/.test(html), 'a link to a Japanese page says so on an English page, once', body(html));
}
{
  const { html } = await render('[page](https://www.med.nagoya-u.ac.jp/medical_J/company/) (in Japanese)');
  say(!/page \(Japanese\)/.test(html), 'no label when the words after the link already say it', body(html));
}
{
  const { html } = await render('[NUPACE](https://nupace.iee.nagoya-u.ac.jp/en/index.shtml)', 'ja/study-in-nagoya/faq.md');
  say(/（英語）<\/a>/.test(html), 'a link to an English page says so on a Japanese page', body(html));
}
// The folder of a PDF does not tell its language (an English template sits under /medical_J/): PDFs only say "PDF".
{
  const { html } = await render('[MSPE template](https://www.med.nagoya-u.ac.jp/medical_J/international/pdf/template.pdf)');
  say(/template \(PDF\)<\/a>/.test(html) && !/Japanese/.test(body(html)) && !/hreflang/.test(html), 'a PDF is labelled PDF, without a language guessed from its folder', body(html));
}
// A link the plugin cannot read is left as it is, and the page still builds.
{
  const result = await render('A [broken link](https://) and [another](http://[bad) on one page.');
  say(!result.error && /broken link/.test(result.html ?? ''), 'a link that cannot be read does not stop the build', String(result.error?.message ?? ''));
}

// Acronyms: the first use is explained, later uses are not, and the box lists them.
{
  const { html } = await render('The CUHK programme. CUHK students also apply.');
  const marked = (html.match(/<abbr title="The Chinese University of Hong Kong">CUHK<\/abbr>/g) ?? []).length;
  say(marked === 2 && /Abbreviations on this page/.test(html), 'an acronym is explained at its first use and listed at the end', `${marked} marks`);
}

// Summaries of Japanese-only pages: on English pages, once per page, after the paragraph or inside the list item.
{
  const MEDIA = 'https://www.med.nagoya-u.ac.jp/medical_J/others/media/';
  const { html } = await render(`Apply on the [media page](${MEDIA}).\n\nAgain: [media](${MEDIA}#form).`, 'en/about/contact.md');
  const boxes = (html.match(/<details class="ja-summary">/g) ?? []).length;
  say(boxes === 1 && /<\/p>\s*<details class="ja-summary"><summary>What this Japanese page says<\/summary>/.test(html), 'a summary box follows the paragraph of the first link only', `${boxes} boxes`);
  say(/written automatically \(AI\) from the Japanese page on 25 November 2026/.test(html), 'the summary box says it was written automatically, and when');
  const list = await render(`- Read the [media page](${MEDIA}).`, 'en/about/contact.md');
  say(/<li>[\s\S]*<details class="ja-summary">[\s\S]*<\/details>\s*<\/li>/.test(list.html ?? ''), 'in a list, the summary box stays inside the list item');
  const ja = await render(`[取材](${MEDIA})`, 'ja/about/contact.md');
  say(!/ja-summary/.test(ja.html ?? ''), 'Japanese pages get no summary box');
  const other = await render('[elsewhere](https://www.med.nagoya-u.ac.jp/medical_J/zz-none/)', 'en/about/contact.md');
  say(!/ja-summary/.test(other.html ?? ''), 'a page without a summary gets no box');
}

process.stdout.write(`${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
