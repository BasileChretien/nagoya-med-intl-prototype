/**
 * Calendar files (iCalendar, .ics) built from the data: programme deadlines that have a date, and news events and
 * calls whose day has not passed. Nothing here is typed by hand, so the calendars change when the data does; the
 * site is rebuilt every Monday, so passed dates drop out. Each entry links to its page on the site.
 *   /<lang>/calendar.ics            every coming date, to subscribe to
 *   /<lang>/deadlines/<id>.ics      one programme's deadline, from its fact box
 */
import { createEvents, type EventAttributes } from 'ics';
import type { CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/ui';
import type { NewsItem } from '../pages/[lang]/news/_news';

/** One all-day entry; `end` is the last day, included. */
export interface DatedItem {
  uid: string;
  title: string;
  description?: string;
  url: string;
  start: string;
  end: string;
}

const UID_DOMAIN = 'nagoya-med-intl-prototype';
const DEADLINE: Record<Lang, string> = { en: 'Deadline', ja: '締切' };

/** Today in Japan, YYYY-MM-DD: the office's dates are Japan dates. */
export function todayJapan(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

export type DeadlineStatus = 'open' | 'closed' | 'rolling' | 'tba';

/**
 * The status the site shows. An "open" deadline whose date has passed shows as closed from the next build (every
 * deploy, and every Monday), before anyone updates the data; the content check warns until they do.
 */
export function shownStatus(d: { status: DeadlineStatus; date?: string }, today: string): DeadlineStatus {
  return d.status === 'open' && d.date !== undefined && d.date < today ? 'closed' : d.status;
}

/** A programme's deadline, when it has a date that has not passed and applications are open or rolling. */
export function programmeDeadline(p: CollectionEntry<'programmes'>, lang: Lang, pageUrl: string, today: string): DatedItem | null {
  const d = p.data.deadline;
  if (!d?.date || (d.status !== 'open' && d.status !== 'rolling') || d.date < today) return null;
  return {
    uid: `deadline-${p.id}-${d.date}@${UID_DOMAIN}`,
    title: `${DEADLINE[lang]}: ${(p.data.short ?? p.data.name)[lang]}`,
    description: d.text[lang],
    url: pageUrl,
    start: d.date,
    end: d.date,
  };
}

/**
 * A news event (from its date to its last day) or a call (on its deadline, `until`) that has not passed. A call with
 * no deadline has no date worth keeping, and plain news none at all.
 */
export function newsEntry(n: NewsItem, lang: Lang, url: string, today: string): DatedItem | null {
  const { category, date, title, summary, until } = n.entry.data;
  if (category === 'news') return null;
  if (category === 'call') {
    if (!until || until < today) return null;
    return { uid: `call-${n.id}@${UID_DOMAIN}`, title: `${DEADLINE[lang]}: ${title[lang]}`, description: summary?.[lang], url, start: until, end: until };
  }
  const end = until ?? date;
  if (end < today) return null;
  return { uid: `event-${n.id}@${UID_DOMAIN}`, title: title[lang], description: summary?.[lang], url, start: date, end };
}

const parts = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
};
const dayAfter = (iso: string): string => new Date(Date.parse(`${iso}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

/** The iCalendar text for these entries (all-day events), under the calendar name given. */
export function icsText(items: DatedItem[], calName: string): string {
  const events: EventAttributes[] = items.map((i) => ({
    uid: i.uid,
    title: i.title,
    ...(i.description ? { description: i.description } : {}),
    url: i.url,
    start: parts(i.start),
    end: parts(dayAfter(i.end)),
  }));
  const { error, value } = createEvents(events, {
    productId: '-//Nagoya University Graduate School of Medicine//International site prototype//EN',
    calName,
  });
  if (error || !value) throw new Error(`calendar "${calName}" could not be built: ${error?.message ?? 'no output'}`);
  return value;
}
