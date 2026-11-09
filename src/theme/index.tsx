import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeMode } from '../domain/types';
import { useStore } from '../store';

/** Brand: Sky blue #0EA5E9, Deep blue #0B3D91, White #FFFFFF. */
export const brand = {
  sky: '#0EA5E9',
  skyDark: '#0284C7',
  deep: '#0B3D91',
  white: '#FFFFFF',
};

export interface Palette {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;
  primary: string; // sky
  primaryText: string;
  primarySoft: string;
  accent: string; // deep
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
}

export const light: Palette = {
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
};

export const dark: Palette = {
  scheme: 'dark',
  bg: '#050B18',
  surface: '#0B1526',
  surfaceAlt: '#0F1D33',
  card: '#0D192C',
  border: '#1C2C45',
  text: '#EEF4FF',
  textMuted: '#9DB0CC',
  textInverse: '#050B18',
  primary: brand.sky,
  primaryText: '#FFFFFF',
  primarySoft: '#0C2A44',
  accent: '#7CC4F4',
  success: '#4ADE80',
  successSoft: '#0E2A1B',
  warning: '#FBBF24',
  warningSoft: '#2D2108',
  danger: '#F87171',
  dangerSoft: '#2E1013',
  info: '#38BDF8',
  infoSoft: '#0C2A44',
  neutralSoft: '#132036',
  overlay: 'rgba(0,0,0,0.6)',
  tabBar: '#081120',
};

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
  mode: ThemeMode;
  isDark: boolean;
}

const Ctx = createContext<ThemeCtx>({ c: light, mode: 'system', isDark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const mode = useStore((s) => s.settings.themeMode);
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const value = useMemo(() => ({ c: isDark ? dark : light, mode, isDark }), [isDark, mode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
