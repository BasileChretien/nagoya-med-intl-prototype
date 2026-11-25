import type { APIRoute } from 'astro';
import rss from '@astrojs/rss';
import { t, type Lang } from '../../../i18n/ui';
import { href, langPaths } from '../../../lib/site';
import { newsItems } from './_news';

/** The news feed of each language (RSS), newest first, linking to each item's page on the site. */
export function getStaticPaths() {
  return langPaths();
}

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Lang;
  const ui = t(lang);
  const full = (path: string) => new URL(href(lang, path), site).toString();
  const items = await newsItems();
  return rss({
    title: `${ui.news} | ${ui.site} | ${ui.org}`,
    description: ui.newsLede,
    site: full(''),
    items: items.map((n) => ({
      title: n.entry.data.title[lang],
      link: full(`news/${n.id}`),
      pubDate: new Date(`${n.entry.data.date}T00:00:00+09:00`),
      ...(n.entry.data.summary ? { description: n.entry.data.summary[lang] } : {}),
      categories: [ui.newsCategory[n.entry.data.category]],
    })),
    customData: `<language>${lang}</language>`,
  });
};
