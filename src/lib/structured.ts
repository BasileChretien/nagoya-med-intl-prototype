/**
 * Structured data (schema.org, JSON-LD) that lets search engines read what a page is: the office on the home pages,
 * the path to each content page, and each programme on its page. Only facts the data files hold; a field the data
 * does not have is left out, never filled in. scripts/structured-lib.mjs checks the output after a build.
 */
import type { CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/ui';
import { t, OFFICIAL_URL } from '../i18n/ui';
import { shownStatus, todayJapan } from './calendar';

export type JsonLd = Record<string, unknown>;
const CONTEXT = 'https://schema.org';

/** The graduate school, as the provider or parent of what the site describes. */
function school(lang: Lang): JsonLd {
  return { '@type': 'CollegeOrUniversity', name: t(lang).org, url: OFFICIAL_URL[lang] };
}

/** The office, from contacts.json, on the home page of each language. */
export function officeData(office: CollectionEntry<'contacts'>, lang: Lang, homeUrl: string): JsonLd {
  const d = office.data;
  return {
    '@context': CONTEXT,
    '@type': 'EducationalOrganization',
    name: d.label[lang],
    url: homeUrl,
    email: d.email,
    ...(d.phone ? { telephone: d.phone } : {}),
    ...(d.address ? { address: d.address[lang] } : {}),
    parentOrganization: school(lang),
  };
}

/** The breadcrumb trail shown at the top of a content page. Each item has a full address. */
export function breadcrumbData(items: { name: string; url: string }[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: item.url })),
  };
}

/** A programme on its page. The application deadline is given only while applications are open. */
export function programmeData(p: CollectionEntry<'programmes'>, lang: Lang, pageUrl: string): JsonLd {
  const d = p.data;
  return {
    '@context': CONTEXT,
    '@type': 'EducationalOccupationalProgram',
    name: d.name[lang],
    description: d.audience[lang],
    url: pageUrl,
    provider: school(lang),
    // Eligibility is not mapped to programPrerequisites: some entries hold completion rules there, not entry rules.
    ...(d.degree ? { educationalCredentialAwarded: d.degree[lang] } : {}),
    ...(d.deadline?.date && shownStatus(d.deadline, todayJapan()) === 'open' ? { applicationDeadline: d.deadline.date } : {}),
  };
}

/** JSON for a script element: "<" is escaped so that no text in the data can close the element. */
export function jsonLdText(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
