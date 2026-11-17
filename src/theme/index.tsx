import React, { createContext, useContext, useMemo } from 'react';
import { useStore } from '../store';

/** Brand: Sky blue #0EA5E9, Deep blue #0B3D91, White #FFFFFF. */
export const brand = {
  sky: '#0EA5E9',
  skyDark: '#0284C7',
  deep: '#0B3D91',
  white: '#FFFFFF',
};

export type ThemeName = 'white' | 'black' | 'blue';

export interface Palette {
  name: ThemeName;
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;
  primary: string; // main action colour
  primaryText: string; // text on primary
  primarySoft: string; // tinted background for secondary actions/badges
  primaryStrong: string; // text/icons placed on primarySoft
  accent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  neutralSoft: string;
  overlay: string;
  tabBar: string;
  /** Strong feature cards (Ugent, balance, referrals). */
  heroBg: string;
  heroText: string;
  heroMuted: string;
  heroAccent: string; // icon circle / highlight on hero cards
  heroAccentText: string;
  /** Logo wordmark colour (the mark itself always stays Sleek sky blue). */
  logoWord: string;
  star: string;
}

/** White — clean black-on-white. The default theme. */
export const white: Palette = {
  name: 'white',
  scheme: 'light',
  bg: '#FFFFFF',
  surface: '#F6F6F6',
  surfaceAlt: '#F1F1F1',
  card: '#FFFFFF',
  border: '#E4E4E4',
  text: '#111111',
  textMuted: '#5E5E5E',
  textInverse: '#FFFFFF',
  primary: '#111111',
  primaryText: '#FFFFFF',
  primarySoft: '#F0F0F0',
  primaryStrong: '#111111',
  accent: '#111111',
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  info: '#333333',
  infoSoft: '#F0F0F0',
  neutralSoft: '#F1F1F1',
  overlay: 'rgba(0,0,0,0.45)',
  tabBar: '#FFFFFF',
  heroBg: '#111111',
  heroText: '#FFFFFF',
  heroMuted: '#BDBDBD',
  heroAccent: '#FFFFFF',
  heroAccentText: '#111111',
  logoWord: '#111111',
  star: '#F59E0B',
};

/** Black — white-on-black, easy on the eyes at night and on OLED screens. */
export const black: Palette = {
  name: 'black',
  scheme: 'dark',
  bg: '#000000',
  surface: '#111111',
  surfaceAlt: '#171717',
  card: '#0C0C0C',
  border: '#2A2A2A',
  text: '#F5F5F5',
  textMuted: '#A3A3A3',
  textInverse: '#000000',
  primary: '#FFFFFF',
  primaryText: '#000000',
  primarySoft: '#1F1F1F',
  primaryStrong: '#FFFFFF',
  accent: '#FFFFFF',
  success: '#4ADE80',
  successSoft: '#0E2A1B',
  warning: '#FBBF24',
  warningSoft: '#2D2108',
  danger: '#F87171',
  dangerSoft: '#2E1013',
  info: '#E5E5E5',
  infoSoft: '#1F1F1F',
  neutralSoft: '#171717',
  overlay: 'rgba(0,0,0,0.7)',
  tabBar: '#000000',
  heroBg: '#1A1A1A',
  heroText: '#FFFFFF',
  heroMuted: '#A3A3A3',
  heroAccent: '#FFFFFF',
  heroAccentText: '#000000',
  logoWord: '#FFFFFF',
  star: '#FBBF24',
};

/** Blue — the Sleek brand look: sky blue actions, deep blue text on white. */
export const blue: Palette = {
  name: 'blue',
  scheme: 'light',
  bg: '#FFFFFF',
  surface: '#F4F8FC',
  surfaceAlt: '#EAF4FD',
  card: '#FFFFFF',
  border: '#DCE6F0',
  text: '#0B3D91',
  textMuted: '#4A6285',
  textInverse: '#FFFFFF',
  primary: brand.sky,
  primaryText: '#FFFFFF',
  primarySoft: '#E0F2FE',
  primaryStrong: '#0B3D91',
  accent: brand.deep,
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  info: '#0369A1',
  infoSoft: '#E0F2FE',
  neutralSoft: '#EEF2F6',
  overlay: 'rgba(11,61,145,0.45)',
  tabBar: '#FFFFFF',
  heroBg: brand.deep,
  heroText: '#FFFFFF',
  heroMuted: '#BFE6FB',
  heroAccent: brand.sky,
  heroAccentText: '#FFFFFF',
  logoWord: brand.deep,
  star: '#F59E0B',
};

export const THEMES: Record<ThemeName, Palette> = { white, black, blue };
export const DEFAULT_THEME: ThemeName = 'white';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };
export const font = {
  h1: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '700' as const },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.3 },
};

interface ThemeCtx {
  c: Palette;
  mode: ThemeName;
  isDark: boolean;
}

const Ctx = createContext<ThemeCtx>({ c: white, mode: DEFAULT_THEME, isDark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const stored = useStore((s) => s.settings.themeMode);
  const mode: ThemeName = stored && stored in THEMES ? stored : DEFAULT_THEME;
  const value = useMemo(() => ({ c: THEMES[mode], mode, isDark: THEMES[mode].scheme === 'dark' }), [mode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
