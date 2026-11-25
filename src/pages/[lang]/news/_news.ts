/**
 * Helpers for the news pages. The optional fields "body", "page", "partners" and "until" are declared in the news
 * schema (content.config.ts) and also read here from the data file itself; both give the same values.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import raw from '../../../data/news.json';
import type { Lang } from '../../../i18n/ui';

type Bilingual = { en: string; ja: string };
interface Extra { id: string; body?: Bilingual; page?: string; partners?: string[]; until?: string }

export type NewsEntry = CollectionEntry<'news'>;
export interface NewsItem {
  id: string;
  entry: NewsEntry;
  /** Paragraphs of the item's own text, in both languages. */
  body?: Bilingual;
  /** Path of a related page of this site, such as "partnerships/visits". */
  page?: string;
  /** Partner ids from partners.json. */
  partners: string[];
  /** Last day of the event or of the call; the item date when absent. */
  until: string;
  past: boolean;
  /** Language of the page at `url`, when it can be told from the address. */
  urlLang?: Lang;
}

const extras = new Map((raw as Extra[]).map((x) => [x.id, x]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date at build time, YYYY-MM-DD. */
export const TODAY = new Date().toISOString().slice(0, 10);

/** Language of an old official page, from its address. */
export function pageLang(url: string | undefined): Lang | undefined {
  if (!url) return undefined;
  if (/\/(japanese|medical_J)\//.test(url)) return 'ja';
  if (/\/(english|medical_E)\/|\/jdp\/en\//.test(url)) return 'en';
  return undefined;
}

function toItem(entry: NewsEntry): NewsItem {
  const x = extras.get(entry.id) ?? { id: entry.id };
  const until = x.until && ISO.test(x.until) ? x.until : entry.data.date;
  return {
    id: entry.id,
    entry,
    body: x.body && x.body.en && x.body.ja ? x.body : undefined,
    page: x.page,
    partners: x.partners ?? [],
    until,
    past: entry.data.category !== 'news' && until < TODAY,
    urlLang: pageLang(entry.data.url),
  };
}

/** All news items, newest first. */
export async function newsItems(): Promise<NewsItem[]> {
  const all = await getCollection('news');
  return all.map(toItem).sort((a, b) => b.entry.data.date.localeCompare(a.entry.data.date));
}

export const LABELS = {
  en: {
    past: { event: 'Past event', call: 'Closed' },
    upcoming: 'Upcoming events and calls',
    upcomingUntil: 'until',
    filterPartner: 'Partner',
    shown: '{shown} of {total} items',
    none: 'No item matches these choices.',
    partners: 'Partners',
    related: 'Related page',
    original: 'Original announcement',
    inLang: { en: '', ja: ' (in Japanese)' },
    back: 'All news and events',
    read: 'Read more',
  },
  ja: {
    past: { event: '終了', call: '募集終了' },
    upcoming: 'これからのイベントと募集',
    upcomingUntil: 'まで',
    filterPartner: '連携先',
    shown: '{total}件中{shown}件を表示',
    none: '条件に合う項目はありません。',
    partners: '連携先',
    related: '関連ページ',
    original: '元のお知らせ',
    inLang: { en: '（英語）', ja: '' },
    back: 'お知らせ一覧',
    read: '続きを読む',
  },
} as const;

/** Text of the link to the original announcement, with its language when it differs from the page. */
export function originalLabel(lang: Lang, urlLang: Lang | undefined): string {
  const l = LABELS[lang];
  return urlLang && urlLang !== lang ? `${l.original}${l.inLang[urlLang]}` : l.original;
}
