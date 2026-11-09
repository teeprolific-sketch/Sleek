import { useCallback } from 'react';
import { useStore } from '../store';
import { en, type Dict } from './en';
import { pcm } from './pcm';

/**
 * Translations. English and Nigerian Pidgin ship now; Yoruba, Hausa, Igbo and
 * French are planned and listed as "coming soon" in Settings.
 * Missing keys fall back to English, so a partly translated screen never breaks.
 */
export type Lang = 'en' | 'pcm';
export type TKey = keyof Dict;

export const LANGUAGES: { code: string; name: string; native: string; available: boolean }[] = [
  { code: 'en', name: 'English', native: 'English', available: true },
  { code: 'pcm', name: 'Nigerian Pidgin', native: 'Naija', available: true },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá', available: false },
  { code: 'ha', name: 'Hausa', native: 'Hausa', available: false },
  { code: 'ig', name: 'Igbo', native: 'Igbo', available: false },
  { code: 'fr', name: 'French', native: 'Français', available: false },
];

const DICTS: Record<Lang, Partial<Dict>> = { en, pcm };

export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  let s = DICTS[lang]?.[key] ?? en[key] ?? String(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function useT() {
  const lang = useStore((s) => s.settings.language ?? 'en') as Lang;
  return useCallback((key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
}
