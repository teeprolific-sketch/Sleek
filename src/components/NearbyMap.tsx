import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { areaPoint } from '../domain/geo';
import type { FilteredArtisan } from '../domain/matching';
import { radius, space, useTheme } from '../theme';
import { initials } from '../utils/format';
import { Chip, Icon, Row, Txt } from './ui';

/**
 * Privacy-safe "nearby" view. No street map and no exact positions: artisans are
 * drawn at their AREA centroid (with a small deterministic offset so several
 * artisans in one area don't overlap), on distance rings around the customer's
 * area. Works offline and is light on low-end phones (no map tiles).
 */
export function NearbyMap({ results, center }: { results: FilteredArtisan[]; center: { area: string; city: string } }) {
  const { c } = useTheme();
  const [radiusKm, setRadiusKm] = useState(10);
  const size = 320;
  const mid = size / 2;
  const origin = areaPoint(center.area, center.city);

  const dots = useMemo(() => {
    if (!origin) return [];
    return results
      .map((r, i) => {
        const p = areaPoint(r.artisan.area, r.artisan.city);
        if (!p) return null;
        // equirectangular projection around the origin (km)
        const dx = (p[1] - origin[1]) * 111 * Math.cos((origin[0] * Math.PI) / 180);
        const dy = (p[0] - origin[0]) * 111;
        let h = 0;
        for (const ch of r.artisan.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        const jitterAngle = (h % 360) * (Math.PI / 180);
        const jitter = 0.35 + (h % 7) / 10; // km
        const x = dx + Math.cos(jitterAngle) * jitter;
        const y = dy + Math.sin(jitterAngle) * jitter;
        return { r, i, x, y, d: Math.hypot(x, y) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x && x.d <= radiusKm * 1.05);
  }, [results, origin, radiusKm]);

  if (!origin) {
    return <Txt muted>We don’t have a map position for {center.area} yet. Use the list view.</Txt>;
  }
  const scale = (mid - 18) / radiusKm;
  const rings = [radiusKm / 4, radiusKm / 2, radiusKm];

  return (
    <View>
      <Row wrap gap={8} style={{ marginBottom: space.sm }}>
        {[3, 5, 10, 20].map((k) => (
          <Chip key={k} label={`${k} km`} selected={radiusKm === k} onPress={() => setRadiusKm(k)} />
        ))}
      </Row>
      <View style={{ alignItems: 'center', backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, paddingVertical: space.sm }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityLabel={`${dots.length} available artisans within ${radiusKm} kilometres`}>
          {rings.map((rk) => (
            <G key={rk}>
              <Circle cx={mid} cy={mid} r={rk * scale} stroke={c.border} strokeWidth={1} fill="none" strokeDasharray="4 4" />
              <SvgText x={mid + 4} y={mid - rk * scale + 12} fontSize={10} fill={c.textMuted}>
                {`${rk} km`}
              </SvgText>
            </G>
          ))}
          <Line x1={mid} y1={10} x2={mid} y2={size - 10} stroke={c.border} strokeWidth={0.5} />
          <Line x1={10} y1={mid} x2={size - 10} y2={mid} stroke={c.border} strokeWidth={0.5} />
          <Circle cx={mid} cy={mid} r={9} fill={c.text} stroke={c.bg} strokeWidth={2} />
          {dots.map(({ r, x, y }) => (
            <G key={r.artisan.id} onPress={() => router.push({ pathname: '/artisan/[id]', params: { id: r.artisan.id } })}>
              <Circle cx={mid + x * scale} cy={mid - y * scale} r={14} fill={r.artisan.avatarColor} stroke="#fff" strokeWidth={2} />
              <SvgText x={mid + x * scale} y={mid - y * scale + 4} fontSize={10} fontWeight="bold" fill="#fff" textAnchor="middle">
                {initials(r.artisan.businessName ?? r.artisan.name)}
              </SvgText>
            </G>
          ))}
        </Svg>
        <Row gap={6} style={{ paddingHorizontal: space.md }}>
          <Icon name="eye-off-outline" size={14} color={c.textMuted} />
          <Txt v="tiny" muted style={{ flex: 1 }}>
            APPROXIMATE AREA POSITIONS ONLY. EXACT LOCATIONS ARE NEVER SHOWN. YOU ARE THE DARK DOT ({center.area.toUpperCase()}).
          </Txt>
        </Row>
      </View>
      <Txt v="small" muted style={{ marginTop: space.sm }}>
        {dots.length} available within {radiusKm} km · tap a dot to open the profile.
      </Txt>
    </View>
  );
}
