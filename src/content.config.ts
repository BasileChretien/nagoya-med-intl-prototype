import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/** A text in both languages. */
const L = z.object({ en: z.string(), ja: z.string() });
const sources = z.array(z.string().url()).default([]);
const toConfirm = z.array(z.string()).default([]);

/** Prose pages. One Markdown file per language, same path: en/<section>/<slug>.md and ja/<section>/<slug>.md */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(220),
    section: z.enum(['study-in-nagoya', 'study-abroad', 'degrees', 'partnerships', 'about']),
    order: z.number().default(50),
    summary: z.string().optional(),
    status: z.enum(['verified', 'to-confirm', 'draft-translation']).default('verified'),
    toConfirm,
    sources,
    // YAML reads an unquoted 2026-11-25 as a date: accept both and keep the ISO date string.
    updated: z
      .union([z.string(), z.date()])
      .transform((v) => (typeof v === 'string' ? v : v.toISOString().slice(0, 10)))
      .optional(),
    programmes: z.array(z.string()).default([]),
  }),
});

/** Programme facts, one JSON file per programme, shown in fact boxes, comparison tables and the deadline calendar. */
const programmes = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/data/programmes' }),
  schema: z.object({
    section: z.enum(['study-in-nagoya', 'study-abroad', 'degrees']),
    name: L,
    short: L.optional(),
    audience: L,
    duration: L.optional(),
    capacity: L.optional(),
    cost: L.optional(),
    funding: L.optional(),
    degree: L.optional(),
    /** Language test and scores required, kept apart from eligibility so it can be compared. */
    language: L.optional(),
    eligibility: L.optional(),
    howToApply: L.optional(),
    deadline: z
      .object({
        status: z.enum(['open', 'closed', 'rolling', 'tba']),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        text: L,
      })
      .optional(),
    partners: z.array(z.string()).default([]),
    contact: z.string(),
    page: z.string(),
    sources,
    toConfirm,
  }),
});

const contacts = defineCollection({
  loader: file('src/data/contacts.json'),
  schema: z.object({
    label: L,
    audience: L,
    email: z.string(),
    phone: z.string().optional(),
    fax: z.string().optional(),
    address: L.optional(),
    /** Building, floor and room, shown on the contact cards and the access page. */
    location: L.optional(),
    map: z.object({ lat: z.number(), lng: z.number() }).optional(),
    sources,
    toConfirm,
  }),
});

const partners = defineCollection({
  loader: file('src/data/partners.json'),
  schema: z.object({
    name: L,
    country: L,
    countryCode: z.string().length(2),
    region: z.enum(['Asia', 'Oceania', 'Europe', 'North America', 'Latin America', 'Africa', 'Middle East']),
    links: z.array(z.enum(['GAME', 'MIRAI', 'JDP', 'DD', 'SEP', 'Agreement', 'Clerkship'])).default([]),
    url: z.string().url().optional(),
    /** Year the first agreement was signed, when a source gives it. */
    since: z.string().regex(/^\d{4}$/).optional(),
    sources,
    toConfirm,
  }),
});

const news = defineCollection({
  loader: file('src/data/news.json'),
  schema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.enum(['news', 'event', 'call']),
    title: L,
    summary: L.optional(),
    /** The item's own text; paragraphs separated by a blank line. */
    body: L.optional(),
    url: z.string().url().optional(),
    /** A page of this site the item belongs to, for example "partnerships/visits". */
    page: z.string().optional(),
    /** Ids from partners.json. */
    partners: z.array(z.string()).default([]),
    /** Last day of an event, or a call deadline. */
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sources,
    toConfirm,
  }),
});

const stories = defineCollection({
  loader: file('src/data/stories.json'),
  schema: z.object({
    type: z.enum(['incoming-clerkship', 'incoming-research', 'outgoing', 'degree']),
    name: z.string(),
    university: z.string(),
    country: z.string(),
    countryCode: z.string().length(2).optional(),
    year: z.number().int(),
    departments: z.array(z.string()).default([]),
    lang: z.enum(['en', 'ja']),
    title: z.string().optional(),
    excerpt: z.string(),
    source: z.string().url(),
  }),
});

/** Full text of each student report in its original language. */
const reports = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/data/reports/original' }),
  schema: z.object({
    lang: z.enum(['en', 'ja']),
    title: z.string().nullable().optional(),
    paragraphs: z.array(z.string()).min(1),
  }),
});

/** Automatic (AI) translation of each report into the other language, paragraph for paragraph. */
const translations = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/data/reports/translated' }),
  schema: z.object({
    lang: z.enum(['en', 'ja']),
    method: z.literal('machine'),
    /** Fingerprint of the original this translation was made from (scripts/sync.mjs stamp-report). */
    sourceFingerprint: z.string().optional(),
    title: z.string().nullable().optional(),
    paragraphs: z.array(z.string()).min(1),
  }),
});

/** Photos, each with a description in both languages for screen readers. */
const images = defineCollection({
  loader: file('src/data/images.json'),
  schema: z.object({
    kind: z.enum(['story', 'hero', 'figure']),
    story: z.string().optional(),
    page: z.string().optional(),
    file: z.string(),
    thumb: z.string().optional(),
    thumbWidth: z.number().int().optional(),
    thumbHeight: z.number().int().optional(),
    width: z.number().int(),
    height: z.number().int(),
    alt: L,
    caption: L.optional(),
    source: z.string().url(),
  }),
});

export const collections = { pages, programmes, contacts, partners, news, stories, reports, translations, images };
