/**
 * Tiny on-device intent parser used by the Ugent console demo.
 *
 * The real Ugent is an LLM agent that calls UGENT_TOOLS directly. This parser
 * mimics that behaviour offline so the confirmation flow can be exercised
 * end-to-end without a network.
 */
import { CATEGORIES, CITIES } from '../data/categories';
import type { UgentActionName } from './types';

const SYNONYMS: Record<string, string[]> = {
  mechanic: ['mechanic', 'car', 'brake', 'engine', 'vehicle'],
  cleaner: ['clean', 'cleaner', 'cleaning', 'house help'],
  electrician: ['electric', 'wiring', 'socket', 'light', 'power'],
  plumber: ['plumb', 'leak', 'pipe', 'tap', 'toilet'],
  tailor: ['tailor', 'sew', 'dress', 'agbada', 'native'],
  photographer: ['photo', 'photographer', 'pictures', 'shoot'],
  ac_tech: ['ac', 'air condition', 'aircon'],
  carpenter: ['carpenter', 'wood', 'door', 'cabinet', 'furniture'],
  makeup: ['makeup', 'make-up', 'mua'],
  generator_tech: ['generator', 'gen'],
  painter: ['paint', 'painter'],
};

export interface ParsedIntent {
  action: UgentActionName;
  args: Record<string, unknown>;
  categoryId?: string;
  explanation: string;
}

function findCategory(text: string): string | undefined {
  for (const [id, words] of Object.entries(SYNONYMS)) if (words.some((w) => new RegExp(`\\b${w}`, 'i').test(text))) return id;
  return CATEGORIES.find((c) => text.toLowerCase().includes(c.name.toLowerCase().split(/[ /]/)[0]))?.id;
}

function findWindow(text: string, now = new Date()): { start: string; end: string } | undefined {
  const t = text.toLowerCase();
  const d = new Date(now);
  let dated = false;
  if (/\btomorrow\b/.test(t)) {
    d.setDate(d.getDate() + 1);
    dated = true;
  } else if (/\btoday\b/.test(t)) dated = true;
  else {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const idx = days.findIndex((x) => t.includes(x));
    if (idx >= 0) {
      const diff = (idx - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      dated = true;
    }
  }
  let start = 10;
  let hours = 2;
  const m = t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (m) {
    start = (Number(m[1]) % 12) + (m[2] === 'pm' ? 12 : 0);
    dated = true;
  } else if (/morning/.test(t)) start = 9;
  else if (/afternoon/.test(t)) start = 13;
  else if (/evening/.test(t)) start = 16;
  if (/(all day|full day)/.test(t)) hours = 8;
  if (!dated && !/morning|afternoon|evening/.test(t)) return undefined;
  if (!dated) d.setDate(d.getDate() + 1);
  const s = new Date(d);
  s.setHours(start, 0, 0, 0);
  const e = new Date(s.getTime() + hours * 3_600_000);
  return { start: s.toISOString(), end: e.toISOString() };
}

export function parseIntent(text: string): ParsedIntent {
  const t = text.trim();
  if (/\b(status|my jobs|my bookings|what.?s happening)\b/i.test(t)) return { action: 'list_my_jobs', args: { active_only: true }, explanation: 'Checking your jobs' };
  const categoryId = findCategory(t);
  const city = CITIES.find((c) => t.toLowerCase().includes(c.toLowerCase()));
  const window = categoryId ? findWindow(t) : undefined;
  return {
    action: 'search_available_artisans',
    args: { category_id: categoryId, city, ...(window ?? {}), limit: 3 },
    categoryId,
    explanation: categoryId ? `Searching verified ${CATEGORIES.find((c) => c.id === categoryId)?.name}${city ? ` in ${city}` : ''}${window ? ' for that time' : ' available now'}` : 'Searching available artisans',
  };
}

export function windowFromText(text: string) {
  return findWindow(text);
}
