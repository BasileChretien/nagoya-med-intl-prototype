import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/ui';

export type ImageEntry = CollectionEntry<'images'>;
export type StoryEntry = CollectionEntry<'stories'>;

export interface ReportView {
  /** Language the paragraphs are written in. */
  lang: Lang;
  title: string | null;
  paragraphs: string[];
  /** true when this is the student's own text, false for an automatic translation. */
  original: boolean;
}

let cache: { originals: Map<string, CollectionEntry<'reports'>>; translations: Map<string, CollectionEntry<'translations'>> } | null = null;

async function load() {
  if (!cache) {
    const [o, t] = await Promise.all([getCollection('reports'), getCollection('translations')]);
    cache = { originals: new Map(o.map((e) => [e.id, e])), translations: new Map(t.map((e) => [e.id, e])) };
  }
  return cache;
}

/** The report text to show on a page in `lang`: the original if it is in that language, else its translation. */
export async function reportFor(storyId: string, lang: Lang): Promise<ReportView | null> {
  const { originals, translations } = await load();
  const o = originals.get(storyId);
  if (!o) return null;
  if (o.data.lang === lang) return { lang, title: o.data.title ?? null, paragraphs: o.data.paragraphs, original: true };
  const tr = translations.get(storyId);
  if (tr && tr.data.lang === lang) return { lang, title: tr.data.title ?? null, paragraphs: tr.data.paragraphs, original: false };
  return { lang: o.data.lang, title: o.data.title ?? null, paragraphs: o.data.paragraphs, original: true };
}

/** A short excerpt in the page language, cut at a sentence or word boundary. */
export function excerptOf(paragraphs: string[], max = 260): string {
  const text = paragraphs.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const stops = ['。', '. ', '! ', '? ', '！', '？'].map((s) => window.lastIndexOf(s)).filter((i) => i > max * 0.6);
  if (stops.length) return window.slice(0, Math.max(...stops) + 1).trim();
  const space = Math.max(window.lastIndexOf(' '), window.lastIndexOf('、'));
  return `${window.slice(0, space > max * 0.6 ? space : max).trim()}…`;
}

let imageCache: ImageEntry[] | null = null;
export async function allImages(): Promise<ImageEntry[]> {
  if (!imageCache) imageCache = await getCollection('images');
  return imageCache;
}

export async function storyImages(storyId: string): Promise<ImageEntry[]> {
  return (await allImages()).filter((i) => i.data.kind === 'story' && i.data.story === storyId);
}

export async function pageImages(slug: string): Promise<{ hero?: ImageEntry; figures: ImageEntry[] }> {
  const list = (await allImages()).filter((i) => i.data.page === slug);
  return { hero: list.find((i) => i.data.kind === 'hero'), figures: list.filter((i) => i.data.kind === 'figure') };
}

