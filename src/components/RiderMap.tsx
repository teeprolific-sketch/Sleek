import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';

/** Point along the route at t (0..1). The route is a fixed polyline in a 320×180 box. */
const ROUTE = [
  [34, 140],
  [90, 140],
  [120, 96],
  [190, 96],
  [214, 58],
  [286, 58],
] as const;

function pointAt(t: number): [number, number] {
  const seg = ROUTE.slice(1).map((p, i) => Math.hypot(p[0] - ROUTE[i][0], p[1] - ROUTE[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i]) {
      const k = seg[i] ? d / seg[i] : 0;
      return [ROUTE[i][0] + (ROUTE[i + 1][0] - ROUTE[i][0]) * k, ROUTE[i][1] + (ROUTE[i + 1][1] - ROUTE[i][1]) * k];
    }
    d -= seg[i];
  }
  return [ROUTE[ROUTE.length - 1][0], ROUTE[ROUTE.length - 1][1]];
}

/**
 * Live delivery map. In production the rider's position comes from the rider
 * app every few seconds and the route and arrival time from the maps provider.
 * The demo moves the rider along a fixed route.
 */
export function RiderMap({ progress, shopLabel, dropLabel }: { progress: number; shopLabel: string; dropLabel: string }) {
  const { c } = useTheme();
  const [x, y] = pointAt(progress);
  const path = ROUTE.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
      <Svg width="100%" height={180} viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={320} height={180} fill={c.primarySoft} />
        {/* streets */}
        <G stroke={c.card} strokeWidth={9} strokeLinecap="round" opacity={0.9}>
          <Path d="M0 140 H320" />
          <Path d="M0 96 H320" />
          <Path d="M0 58 H320" />
          <Path d="M90 0 V180" />
          <Path d="M214 0 V180" />
          <Path d="M150 0 V180" />
        </G>
        <Path d={path} stroke={c.primary} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 0" />
        {/* shop */}
        <Circle cx={ROUTE[0][0]} cy={ROUTE[0][1]} r={8} fill={c.card} stroke={c.text} strokeWidth={2} />
        <SvgText x={ROUTE[0][0]} y={ROUTE[0][1] + 24} fontSize={10} fontWeight="700" fill={c.text} textAnchor="middle">
          {shopLabel.slice(0, 18)}
        </SvgText>
        {/* drop-off */}
        <Circle cx={ROUTE[5][0]} cy={ROUTE[5][1]} r={10} fill={c.success} />
        <SvgText x={ROUTE[5][0]} y={ROUTE[5][1] - 16} fontSize={10} fontWeight="700" fill={c.text} textAnchor="middle">
          {dropLabel.slice(0, 18)}
        </SvgText>
        {/* rider */}
        <Circle cx={x} cy={y} r={15} fill={c.primary} opacity={0.18} />
        <Circle cx={x} cy={y} r={9} fill={c.primary} stroke="#fff" strokeWidth={3} />
      </Svg>
    </View>
  );
}
