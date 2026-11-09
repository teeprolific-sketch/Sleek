import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ArtisanCard } from '../components/domain';
import { CoachTip } from '../components/feedback';
import { NearbyMap } from '../components/NearbyMap';
import { Banner, Chip, EmptyState, Field, IconButton, Row, Screen, Segmented, Spacer, Txt } from '../components/ui';
import { CATEGORIES, category, categoryName, CITIES, POPULAR_CATEGORY_IDS } from '../data/categories';
import { activePreferenceCount, applyPreferences, DEFAULT_PREFS } from '../domain/matching';
import { searchAvailable } from '../domain/ranking';
import type { MatchingPrefs, TimeWindow } from '../domain/types';
import { useMyCustomer, useStore } from '../store';
import { space } from '../theme';
import { day, naira } from '../utils/format';

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
  const setPrefs = useStore((s) => s.setMatchingPrefs);
  const [q, setQ] = useState(params.q ?? '');
  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId || undefined);
  const [city, setCity] = useState(me?.city ?? 'Lagos');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [dayOffset, setDayOffset] = useState(1);
  const [period, setPeriod] = useState('morning');
  const prefs: MatchingPrefs = { ...DEFAULT_PREFS, ...me?.prefs };

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

  const ranked = useMemo(
    () => searchAvailable(artisans, jobs, { categoryId: effectiveCat, text: effectiveCat ? undefined : q, city, window: effectiveCat ? window : undefined, categoryName }, Date.now()),
    [artisans, jobs, effectiveCat, q, city, window],
  );
  const center = { area: me?.city === city ? me?.area ?? city : city, city };
  const results = useMemo(() => applyPreferences(ranked, prefs, { categoryId: effectiveCat, customer: center, jobs, now: Date.now() }), [ranked, me?.prefs, effectiveCat, center.area, center.city, jobs]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = ranked.length - results.length;
  const nPrefs = activePreferenceCount(prefs);

  // Active filter chips (tap to remove)
  const chips: { label: string; clear: Partial<MatchingPrefs> }[] = [];
  if (prefs.maxDistanceKm != null) chips.push({ label: `≤ ${prefs.maxDistanceKm} km`, clear: { maxDistanceKm: null } });
  if (prefs.minRating) chips.push({ label: `${prefs.minRating}★+`, clear: { minRating: 0 } });
  if (prefs.priceMin != null || prefs.priceMax != null) chips.push({ label: `${prefs.priceMin ? naira(prefs.priceMin) : '₦0'} – ${prefs.priceMax ? naira(prefs.priceMax) : 'any'}`, clear: { priceMin: undefined, priceMax: undefined } });
  if (prefs.trustedOnly) chips.push({ label: 'Trusted only', clear: { trustedOnly: false } });
  if (prefs.availableToday) chips.push({ label: 'Free today', clear: { availableToday: false } });
  if (prefs.genderPreference !== 'any') chips.push({ label: `${prefs.genderPreference === 'female' ? 'Female' : 'Male'} (where relevant)`, clear: { genderPreference: 'any' } });

  return (
    <Screen
      title={effectiveCat ? category(effectiveCat).name : 'Find an artisan'}
      subtitle={`${results.length} available · ranked best first`}
      right={<IconButton icon="options-outline" label="Filters and preferences" badge={nPrefs} onPress={() => router.push('/preferences')} />}
    >
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
      <Segmented value={when} onChange={setWhen} options={[{ value: 'now', label: 'Available now' }, { value: 'later', label: 'Book for later' }]} />
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

      {chips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }} contentContainerStyle={{ gap: 8 }}>
          {chips.map((ch) => (
            <Chip key={ch.label} label={`${ch.label}  ✕`} selected onPress={() => setPrefs(ch.clear)} />
          ))}
        </ScrollView>
      ) : null}
      <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
        <Txt v="small" muted style={{ flex: 1 }}>
          {hidden > 0 ? `${hidden} more hidden by your filters` : 'Only available, skill-verified artisans'}
        </Txt>
        <View style={{ width: 150 }}>
          <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Nearby' }]} />
        </View>
      </Row>
      <CoachTip id="tip_search" title="Tip: set your preferences once" body="Tap the sliders icon to set distance, minimum rating, price range and more. We’ll remember them for every search." icon="options-outline" />
      <Spacer h={space.sm} />
      {effectiveCat && category(effectiveCat).risk === 'high' ? (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="warning" icon="shield-checkmark-outline" body={`${category(effectiveCat).name} is a higher-risk trade. Every artisan shown passed an extra human review of their skill video.`} />
        </View>
      ) : null}
      {view === 'map' ? (
        <NearbyMap results={results} center={center} />
      ) : results.length ? (
        results.map((r, i) => <ArtisanCard key={r.artisan.id} artisan={r.artisan} categoryId={effectiveCat} rank={i + 1} freeWorkers={r.freeWorkers?.length} distanceKm={r.distanceKm} />)
      ) : (
        <EmptyState
          icon="search-outline"
          title="No available artisans"
          body={hidden > 0 ? 'Your filters are hiding some artisans. Try widening the distance or lowering the minimum rating.' : when === 'now' ? 'Everyone verified for this is busy or offline right now. Try “Book for later” or another city.' : 'Nobody is free in that window. Try a different day or time.'}
          action={hidden > 0 ? 'Edit filters' : when === 'now' ? 'Book for later' : undefined}
          onAction={() => (hidden > 0 ? router.push('/preferences') : setWhen('later'))}
        />
      )}
    </Screen>
  );
}
