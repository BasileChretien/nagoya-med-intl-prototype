import type { APIRoute } from 'astro';
import { getCollection, getEntry } from 'astro:content';
import { t, LANGS, type Lang } from '../../../i18n/ui';
import { href } from '../../../lib/site';
import { icsText, programmeDeadline, todayJapan } from '../../../lib/calendar';

/** One programme's deadline, for the "Add to calendar" link in its fact box. Built only for a coming dated deadline. */
export async function getStaticPaths() {
  const today = todayJapan();
  const programmes = await getCollection('programmes');
  return LANGS.flatMap((lang) => programmes
    .filter((p) => programmeDeadline(p, lang, '', today))
    .map((p) => ({ params: { lang, id: p.id } })));
}

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Lang;
  const p = await getEntry('programmes', params.id as string);
  const item = p && programmeDeadline(p, lang, new URL(href(lang, p.data.page), site).toString(), todayJapan());
  if (!p || !item) return new Response('Not found', { status: 404 });
  return new Response(icsText([item], `${t(lang).calendarName}: ${(p.data.short ?? p.data.name)[lang]}`), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
