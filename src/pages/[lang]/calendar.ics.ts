import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { t, type Lang } from '../../i18n/ui';
import { href, langPaths } from '../../lib/site';
import { icsText, newsEntry, programmeDeadline, todayJapan, type DatedItem } from '../../lib/calendar';
import { newsItems } from './news/_news';

/** Every coming date (programme deadlines, news events and calls) in one calendar to subscribe to. */
export function getStaticPaths() {
  return langPaths();
}

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Lang;
  const today = todayJapan();
  const full = (path: string) => new URL(href(lang, path), site).toString();
  const programmes = await getCollection('programmes');
  const items: DatedItem[] = [
    ...programmes.map((p) => programmeDeadline(p, lang, full(p.data.page), today)),
    ...(await newsItems()).map((n) => newsEntry(n, lang, full(`news/${n.id}`), today)),
  ].filter((i): i is DatedItem => i !== null).sort((a, b) => a.start.localeCompare(b.start));
  return new Response(icsText(items, t(lang).calendarName), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
