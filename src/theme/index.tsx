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
  /** Logo colours for this theme. */
  logoMark: string;
  logoWord: string;
  star: string;
}

/** White — white with sky blue. The default theme. */
export const white: Palette = {
  name: 'white',
  scheme: 'light',
  bg: '#FFFFFF',
  surface: '#F5FAFE',
  surfaceAlt: '#EEF7FD',
  card: '#FFFFFF',
  border: '#DDEBF5',
  text: '#102A43',
  textMuted: '#5A7088',
  textInverse: '#FFFFFF',
  primary: brand.sky,
  primaryText: '#FFFFFF',
  primarySoft: '#E0F2FE',
  primaryStrong: '#0369A1',
  accent: brand.sky,
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  info: '#0369A1',
  infoSoft: '#E0F2FE',
  neutralSoft: '#F1F6FA',
  overlay: 'rgba(16,42,67,0.45)',
  tabBar: '#FFFFFF',
  heroBg: brand.sky,
  heroText: '#FFFFFF',
  heroMuted: '#E0F2FE',
  heroAccent: '#FFFFFF',
  heroAccentText: '#0369A1',
  logoMark: brand.sky,
  logoWord: brand.sky,
  star: '#F59E0B',
};

/** Black — only black, white and a very light sky blue. */
const LIGHT_SKY = '#7DD3FC';
export const black: Palette = {
  name: 'black',
  scheme: 'dark',
  bg: '#000000',
  surface: '#0D0D0D',
  surfaceAlt: '#121212',
  card: '#080808',
  border: '#262626',
  text: '#FFFFFF',
  textMuted: '#A3A3A3',
  textInverse: '#000000',
  primary: LIGHT_SKY,
  primaryText: '#000000',
  primarySoft: '#121212',
  primaryStrong: LIGHT_SKY,
  accent: LIGHT_SKY,
  success: '#4ADE80',
  successSoft: '#0E2A1B',
  warning: '#FBBF24',
  warningSoft: '#2D2108',
  danger: '#F87171',
  dangerSoft: '#2E1013',
  info: LIGHT_SKY,
  infoSoft: '#121212',
  neutralSoft: '#121212',
  overlay: 'rgba(0,0,0,0.75)',
  tabBar: '#000000',
  heroBg: '#121212',
  heroText: '#FFFFFF',
  heroMuted: '#A3A3A3',
  heroAccent: LIGHT_SKY,
  heroAccentText: '#000000',
  logoMark: LIGHT_SKY,
  logoWord: '#FFFFFF',
  star: LIGHT_SKY,
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
  logoMark: brand.sky,
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
