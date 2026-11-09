import { suggestSlots } from './availability';
import { areaDistanceKm } from './geo';
import type { RankedArtisan } from './ranking';
import { displayRating, isTrusted } from './trust';
import type { Category, Job, MatchingPrefs } from './types';

export const DEFAULT_PREFS: MatchingPrefs = { genderPreference: 'any', minRating: 0, trustedOnly: false, maxDistanceKm: null, availableToday: false };

/** Trades where customers commonly prefer a specific gender (personal or in-home care). */
export const GENDER_RELEVANT = new Set(['hair_stylist', 'makeup', 'nails', 'massage', 'nanny', 'caregiver', 'tailor', 'gele', 'cleaner', 'fitness', 'barber']);

export function genderApplies(categoryId?: string): boolean {
  return !categoryId || GENDER_RELEVANT.has(categoryId);
}

export interface MatchContext {
  categoryId?: string;
  category?: Category;
  customer: { area: string; city: string };
  jobs: Job[];
  now: number;
}

export interface FilteredArtisan extends RankedArtisan {
  distanceKm: number | null;
  freeToday?: boolean;
}

/** Apply a customer's matching preferences on top of the ranked, available-only list. Order is preserved (best → last). */
export function applyPreferences(results: RankedArtisan[], prefs: MatchingPrefs, ctx: MatchContext): FilteredArtisan[] {
  const today = new Date(ctx.now);
  return results
    .map((r): FilteredArtisan => ({ ...r, distanceKm: areaDistanceKm(ctx.customer, r.artisan) }))
    .filter((r) => {
      const a = r.artisan;
      if (prefs.genderPreference !== 'any' && genderApplies(ctx.categoryId) && a.gender !== prefs.genderPreference) return false;
      if (prefs.minRating > 0 && displayRating(a) < prefs.minRating) return false;
      if (prefs.trustedOnly && !isTrusted(a, ctx.now)) return false;
      if (prefs.maxDistanceKm != null && (r.distanceKm == null || r.distanceKm > prefs.maxDistanceKm)) return false;
      const price = ctx.categoryId ? a.startingPrices[ctx.categoryId] : Math.min(...Object.values(a.startingPrices));
      if (prefs.priceMin != null && Number.isFinite(price) && price < prefs.priceMin) return false;
      if (prefs.priceMax != null && Number.isFinite(price) && price > prefs.priceMax) return false;
      return true;
    })
    .map((r): FilteredArtisan => {
      if (!prefs.availableToday) return r;
      const cats = ctx.categoryId ? [ctx.categoryId] : r.artisan.skills.filter((s) => s.status === 'approved').map((s) => s.categoryId);
      const freeToday = cats.some((cid) => suggestSlots(ctx.jobs, r.artisan, cid, today, 60, ctx.now).length > 0);
      return { ...r, freeToday };
    })
    .filter((r) => !prefs.availableToday || r.freeToday);
}

export function activePreferenceCount(p: MatchingPrefs): number {
  return [p.genderPreference !== 'any', p.minRating > 0, p.trustedOnly, p.maxDistanceKm != null, p.availableToday, p.priceMin != null || p.priceMax != null].filter(Boolean).length;
}
