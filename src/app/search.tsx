import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ArtisanCard } from '../components/domain';
import { Banner, Chip, EmptyState, Field, Row, Screen, Segmented, Spacer, Txt } from '../components/ui';
import { CATEGORIES, category, categoryName, CITIES, POPULAR_CATEGORY_IDS } from '../data/categories';
import { searchAvailable } from '../domain/ranking';
import type { TimeWindow } from '../domain/types';
import { useMyCustomer, useStore } from '../store';
import { space } from '../theme';
import { day } from '../utils/format';

const PERIODS = [
  { id: 'morning', label: 'Morning', start: 8, end: 12 },
  { id: 'afternoon', label: 'Afternoon', start: 12, end: 16 },
  { id: 'evening', label: 'Evening', start: 16, end: 19 },
];

export default function Search() {
  const params = useLocalSearchParams<{ q?: string; categoryId?: string }>();
  const me = useMyCustomer();
  const artisans = useStore((s) => s.artisans);
  const jobs = useStore((s) => s.jobs);
  const [q, setQ] = useState(params.q ?? '');
  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId || undefined);
  const [city, setCity] = useState(me?.city ?? 'Lagos');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [dayOffset, setDayOffset] = useState(1);
  const [period, setPeriod] = useState('morning');

  // Free-text → category, so "plumber" or "ac" maps to the right trade.
  const textCat = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return undefined;
    return CATEGORIES.find((x) => x.name.toLowerCase().includes(t) || x.id.includes(t.replace(/\s+/g, '_')));
  }, [q]);
  const effectiveCat = categoryId ?? textCat?.id;

  const window: TimeWindow | undefined = useMemo(() => {
    if (when === 'now') return undefined;
    const p = PERIODS.find((x) => x.id === period)!;
    const d = new Date(Date.now() + dayOffset * 86_400_000);
    const s = new Date(d);
    s.setHours(p.start, 0, 0, 0);
    const e = new Date(d);
    e.setHours(p.end, 0, 0, 0);
    return { start: s.toISOString(), end: e.toISOString() };
  }, [when, dayOffset, period]);

  const results = useMemo(
    () => searchAvailable(artisans, jobs, { categoryId: effectiveCat, text: effectiveCat ? undefined : q, city, window: effectiveCat ? window : undefined, categoryName }, Date.now()),
    [artisans, jobs, effectiveCat, q, city, window],
  );

  return (
    <Screen title={effectiveCat ? category(effectiveCat).name : 'Find an artisan'} subtitle={`${results.length} available · ranked best first`}>
      <Field placeholder="Search by trade, name or area" value={q} onChangeText={(t) => { setQ(t); if (categoryId) setCategoryId(undefined); }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" selected={!effectiveCat} onPress={() => { setCategoryId(undefined); setQ(''); }} />
        {[...new Set([...(effectiveCat ? [effectiveCat] : []), ...POPULAR_CATEGORY_IDS])].map((id) => (
          <Chip key={id} label={category(id).name} icon={category(id).icon} selected={effectiveCat === id} onPress={() => { setCategoryId(id); setQ(''); }} />
        ))}
        <Chip label="More…" onPress={() => router.push('/categories')} />
      </ScrollView>
      <Spacer />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CITIES.map((x) => (
          <Chip key={x} label={x} icon="location-outline" selected={city === x} onPress={() => setCity(x)} />
        ))}
      </ScrollView>
      <Spacer />
      <Segmented
        value={when}
        onChange={setWhen}
        options={[
          { value: 'now', label: 'Available now' },
          { value: 'later', label: 'Book for later' },
        ]}
      />
      {when === 'later' ? (
        <View style={{ marginTop: space.md }}>
          <Row wrap gap={8}>
            {[0, 1, 2, 3, 4, 5, 6].map((o) => (
              <Chip key={o} label={day(new Date(Date.now() + o * 86_400_000))} selected={dayOffset === o} onPress={() => setDayOffset(o)} />
            ))}
          </Row>
          <Row wrap gap={8} style={{ marginTop: 8 }}>
            {PERIODS.map((p) => (
              <Chip key={p.id} label={`${p.label} ${p.start > 12 ? p.start - 12 : p.start}${p.start >= 12 ? 'pm' : 'am'}–${p.end > 12 ? p.end - 12 : p.end}${p.end >= 12 ? 'pm' : 'am'}`} selected={period === p.id} onPress={() => setPeriod(p.id)} />
            ))}
          </Row>
          {!effectiveCat ? (
            <Txt v="small" muted style={{ marginTop: 8 }}>
              Pick a service to check availability for that time.
            </Txt>
          ) : null}
        </View>
      ) : null}
      <Spacer h={space.lg} />
      {effectiveCat && category(effectiveCat).risk === 'high' ? (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="warning" icon="shield-checkmark-outline" body={`${category(effectiveCat).name} is a higher-risk trade. Every artisan shown passed an extra human review of their skill video.`} />
        </View>
      ) : null}
      {results.length ? (
        results.map((r, i) => <ArtisanCard key={r.artisan.id} artisan={r.artisan} categoryId={effectiveCat} rank={i + 1} freeWorkers={r.freeWorkers?.length} />)
      ) : (
        <EmptyState
          icon="search-outline"
          title="No available artisans"
          body={when === 'now' ? 'Everyone verified for this is busy or offline right now. Try “Book for later” or another city.' : 'Nobody is free in that window. Try a different day or time.'}
          action={when === 'now' ? 'Book for later' : undefined}
          onAction={() => setWhen('later')}
        />
      )}
    </Screen>
  );
}
