import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg';
import { brand, useTheme } from '../theme';
import { WORDMARK_PATH, WORDMARK_VIEWBOX } from './logoPaths';

/** Sleek mark geometry — same as assets/brand/sleek-mark.svg (120×120). */
const BODY = 'M29 35 Q60 47 91 35 L113 54 L113 85 L86 110 L64.5 95 L93 72 L76 57 L44 57 L27 72 L55.5 95 L34 110 L7 85 L7 54 Z';
const CUTS = 'M44.5 57.5 L37 38.5 M75.5 57.5 L83 38.5';

export function LogoMark({ size = 40, color = brand.sky }: { size?: number; color?: string }) {
  const id = `sleekcut${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="Sleek">
      <Defs>
        <Mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <Rect width="120" height="120" fill="#fff" />
          <Path d={CUTS} stroke="#000" strokeWidth={3.2} strokeLinecap="round" />
        </Mask>
      </Defs>
      <G mask={`url(#${id})`}>
        <Circle cx={30} cy={14} r={12} fill={color} />
        <Circle cx={90} cy={14} r={12} fill={color} />
        <Path d={BODY} fill={color} stroke={color} strokeWidth={5} strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

/** Horizontal logo: mark + "Sleek" wordmark. `tone` picks the colourway for the background it sits on. */
export function Logo({ height = 36, tone = 'auto' }: { height?: number; tone?: 'auto' | 'sky' | 'white' | 'two-tone' }) {
  const { c } = useTheme();
  // Colours follow the theme: all sky blue (White), light blue + white (Black), sky + deep blue (Blue).
  const markColor = tone === 'white' ? '#FFFFFF' : tone === 'auto' ? c.logoMark : brand.sky;
  const wordColor = tone === 'white' ? '#FFFFFF' : tone === 'sky' ? brand.sky : tone === 'two-tone' ? brand.deep : c.logoWord;
  const [, , vw, vh] = WORDMARK_VIEWBOX.split(' ').map(Number);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: height * 0.18 }} accessibilityRole="image" accessibilityLabel="Sleek">
      <LogoMark size={height} color={markColor} />
      <Svg width={(height * vw) / vh} height={height} viewBox={WORDMARK_VIEWBOX}>
        <Path d={WORDMARK_PATH} fill={wordColor} />
      </Svg>
    </View>
  );
}
