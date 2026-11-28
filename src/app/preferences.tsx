import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Banner, Button, Card, Chip, Row, Screen, Section, Segmented, Toggle, Txt } from '../components/ui';
import { activePreferenceCount, DEFAULT_PREFS } from '../domain/matching';
import type { GenderPreference } from '../domain/types';
import { useMyCustomer, useStore } from '../store';
import { space } from '../theme';
import { naira } from '../utils/format';

const DISTANCES: (number | null)[] = [3, 5, 10, 20, null];
const RATINGS = [0, 4, 4.5, 4.8];
const PRICES: { label: string; min?: number; max?: number }[] = [
  { label: 'Any price' },
  { label: `Under ${naira(15000)}`, max: 15000 },
  { label: `${naira(15000)} – ${naira(50000)}`, min: 15000, max: 50000 },
  { label: `Over ${naira(50000)}`, min: 50000 },
];

/** Smart matching preferences, applied by default in search and on Home. */
export default function Preferences() {
  const me = useMyCustomer();
  const set = useStore((s) => s.setMatchingPrefs);
  const p = { ...DEFAULT_PREFS, ...me?.prefs };
  return (
    <Screen title="Matching preferences" footer={<Button title="Done" onPress={() => router.back()} />}>
      <Banner tone="primary" icon="options-outline" body={`${activePreferenceCount(p)} preference(s) on. They narrow your results — only available, verified artisans are ever shown.`} />
      <Section title="Artisan gender (where relevant)">
        <Segmented<GenderPreference> value={p.genderPreference} onChange={(v) => set({ genderPreference: v })} options={[{ value: 'any', label: 'No preference' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
        <Txt v="small" muted style={{ marginTop: 6 }}>
          Only applied to personal and in-home services like hair, makeup, nannies, caregivers, cleaning, tailoring and fitness.
        </Txt>
      </Section>
      <Section title="Minimum rating">
        <Row wrap gap={8}>
          {RATINGS.map((r) => (
            <Chip key={r} label={r ? `${r}★ & up` : 'Any'} selected={p.minRating === r} onPress={() => set({ minRating: r })} />
          ))}
        </Row>
      </Section>
      <Section title="Distance from you">
        <Row wrap gap={8}>
          {DISTANCES.map((d) => (
            <Chip key={String(d)} label={d ? `Within ${d} km` : 'Any distance'} selected={p.maxDistanceKm === d} onPress={() => set({ maxDistanceKm: d })} />
          ))}
        </Row>
        <Txt v="small" muted style={{ marginTop: 6 }}>
          Measured between areas (e.g. Yaba → Surulere). Exact locations are never shared.
        </Txt>
      </Section>
      <Section title="Price range (starting price)">
        <Row wrap gap={8}>
          {PRICES.map((x) => (
            <Chip key={x.label} label={x.label} selected={p.priceMin === x.min && p.priceMax === x.max} onPress={() => set({ priceMin: x.min, priceMax: x.max })} />
          ))}
        </Row>
      </Section>
      <Section title="More">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">Trusted artisans only</Txt>
              <Txt v="small" muted>
                10+ Sleek Hold jobs, 4.5★+, no recent rule breaks
              </Txt>
            </View>
            <Toggle label="Trusted only" value={p.trustedOnly} onChange={(v) => set({ trustedOnly: v })} />
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">Has a free slot today</Txt>
              <Txt v="small" muted>
                Hide artisans who are fully booked today
              </Txt>
            </View>
            <Toggle label="Available today" value={p.availableToday} onChange={(v) => set({ availableToday: v })} />
          </Row>
          <Txt v="small" muted style={{ marginTop: space.md }}>
            Skill verification is always required — every artisan you see is verified for the skill you search.
          </Txt>
        </Card>
      </Section>
      <Button variant="ghost" title="Reset to defaults" style={{ marginTop: space.lg }} onPress={() => set(DEFAULT_PREFS)} />
    </Screen>
  );
}
