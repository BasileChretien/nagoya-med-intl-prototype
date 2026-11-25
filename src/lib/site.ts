import { getCollection, type CollectionEntry } from 'astro:content';
import { LANGS, SECTIONS, type Lang, type Section } from '../i18n/ui';

export type PageEntry = CollectionEntry<'pages'>;
export type ProgrammeEntry = CollectionEntry<'programmes'>;

/** Prefix a site path with the configured base and language. `path` has no leading slash. */
export function href(lang: Lang | null, path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const parts = [base, lang, path].filter((p) => p !== null && p !== '').join('/').replace(/\/+/g, '/');
  return parts.endsWith('/') ? parts : `${parts}/`;
}

/** Asset path under /public. */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

interface PhotoSizes { file: string; thumb?: string; width: number; height: number; thumbWidth?: number; thumbHeight?: number }

/**
 * The image a card shows: the thumbnail, with its own sizes when both are recorded, or with the full photo's sizes
 * otherwise (same shape), so width and height never come from two different files.
 */
export function cardImage(d: PhotoSizes): { src: string; width: number; height: number } {
  if (d.thumb && d.thumbWidth && d.thumbHeight) return { src: asset(d.thumb), width: d.thumbWidth, height: d.thumbHeight };
  return { src: asset(d.thumb ?? d.file), width: d.width, height: d.height };
}

export interface PageRef {
  lang: Lang;
  /** Path after the language, e.g. "study-in-nagoya" or "study-in-nagoya/faq". */
  slug: string;
  section: Section;
  isIndex: boolean;
}

/** Split a glob id such as "en/study-in-nagoya/faq" or "en/study-in-nagoya/index". */
export function pageRef(entry: PageEntry): PageRef {
  const parts = entry.id.split('/');
  const lang = parts[0] as Lang;
  const rest = parts.slice(1);
  if (rest[rest.length - 1] === 'index') rest.pop();
  return { lang, slug: rest.join('/'), section: entry.data.section as Section, isIndex: rest.length === 1 };
}

export async function pagesFor(lang: Lang): Promise<PageEntry[]> {
  const all = await getCollection('pages');
  return all.filter((p) => pageRef(p).lang === lang);
}

export async function sectionPages(lang: Lang, section: Section): Promise<PageEntry[]> {
  const pages = await pagesFor(lang);
  return pages
    .filter((p) => pageRef(p).section === section && !pageRef(p).isIndex)
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function counterpartExists(lang: Lang, slug: string): Promise<boolean> {
  const other: Lang = lang === 'en' ? 'ja' : 'en';
  const pages = await pagesFor(other);
  return pages.some((p) => pageRef(p).slug === slug);
}

export async function programmesIn(section?: Section): Promise<ProgrammeEntry[]> {
  const all = await getCollection('programmes');
  const order: Record<string, number> = Object.fromEntries(SECTIONS.map((s, i) => [s, i]));
  return all
    .filter((p) => !section || p.data.section === section)
    .sort((a, b) => order[a.data.section] - order[b.data.section] || a.data.name.en.localeCompare(b.data.name.en));
}

export function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'ja' : 'en';
}

export function langPaths(): { params: { lang: Lang } }[] {
  return LANGS.map((lang) => ({ params: { lang } }));
}

const DATE_FMT: Record<Lang, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  ja: new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
};

export function formatDate(iso: string, lang: Lang): string {
  return DATE_FMT[lang].format(new Date(`${iso}T00:00:00`));
}

/**
 * Whether a date can be shown as "checked against the official pages": the content has a source on the university's
 * own sites and is not an automatic translation still waiting for its check. Otherwise the date is shown as the day
 * the content was last updated.
 */
export function checkedAgainstOfficial(sources: string[], status?: string): boolean {
  if (status === 'draft-translation') return false;
  return sources.some((u) => {
    try {
      return /(^|\.)nagoya-u\.ac\.jp$/.test(new URL(u).hostname);
    } catch {
      return false;
    }
  });
}
