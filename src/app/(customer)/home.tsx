import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { ArtisanCard, JobCard } from '../../components/domain';
import { CoachTip } from '../../components/feedback';
import { Avatar, Banner, Card, Icon, IconButton, Row, Screen, Section, Txt } from '../../components/ui';
import { category, categoryName, POPULAR_CATEGORY_IDS } from '../../data/categories';
import { availabilityNow } from '../../domain/availability';
import { applyPreferences, DEFAULT_PREFS } from '../../domain/matching';
import { searchAvailable } from '../../domain/ranking';
import { useT, type TKey } from '../../i18n';
import { useMyCustomer, useStore, useUnreadCount } from '../../store';
import { radius, space, useTheme } from '../../theme';

const QUICK: { key: TKey; icon: string; to: string }[] = [
  { key: 'home.quick.favourites', icon: 'heart-outline', to: '/favourites' },
  { key: 'home.quick.history', icon: 'time-outline', to: '/history' },
  { key: 'home.quick.disputes', icon: 'flag-outline', to: '/disputes' },
  { key: 'home.quick.refer', icon: 'gift-outline', to: '/referrals' },
];

export default function CustomerHome() {
  const { c } = useTheme();
  const t = useT();
  const me = useMyCustomer();
  const artisans = useStore((s) => s.artisans);
  const jobs = useStore((s) => s.jobs);
  const unread = useUnreadCount();
  const [q, setQ] = useState('');

  const top = useMemo(() => {
    const ranked = searchAvailable(artisans, jobs, { city: me?.city, categoryName }, Date.now());
    return applyPreferences(ranked, { ...DEFAULT_PREFS, ...me?.prefs }, { customer: { area: me?.area ?? '', city: me?.city ?? '' }, jobs, now: Date.now() }).slice(0, 5);
  }, [artisans, jobs, me?.city, me?.area, me?.prefs]);
  const attention = useMemo(
    () => jobs.filter((j) => j.customerId === me?.id && ['proof_submitted', 'price_agreed', 'requested', 'funded', 'in_progress', 'disputed'].includes(j.status)).slice(0, 2),
    [jobs, me?.id],
  );
  const saved = useMemo(() => artisans.filter((a) => me?.favourites?.includes(a.id)), [artisans, me?.favourites]);
  const isNew = !jobs.some((j) => j.customerId === me?.id);

  const hour = new Date().getHours();
  const greet = hour < 12 ? t('home.morning') : hour < 17 ? t('home.afternoon') : t('home.evening');

  return (
    <Screen back={false}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Txt muted>{greet}</Txt>
          <Txt v="h1">{me?.name.split(' ')[0] ?? 'there'} 👋</Txt>
        </View>
        <IconButton icon="notifications-outline" label="Notifications" badge={unread} onPress={() => router.push('/notifications')} />
      </Row>

      <View style={{ marginTop: space.lg, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 50 }}>
        <Icon name="search-outline" color={c.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('home.searchPlaceholder')}
          placeholderTextColor={c.textMuted}
          style={{ flex: 1, color: c.text, fontSize: 16, minHeight: 48 }}
          returnKeyType="search"
          onSubmitEditing={() => router.push({ pathname: '/search', params: { q } })}
        />
        <Pressable onPress={() => router.push('/preferences')} hitSlop={8} accessibilityLabel="Matching preferences">
          <Icon name="options-outline" color={c.textMuted} />
        </Pressable>
      </View>

      <Row gap={space.sm} style={{ marginTop: space.md }}>
        {QUICK.map((x) => (
          <Pressable key={x.key} onPress={() => router.push(x.to as never)} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: c.surface }}>
            <Icon name={x.icon} size={20} color={c.primary} />
            <Txt v="tiny" center style={{ marginTop: 4 }} numberOfLines={1}>
              {t(x.key)}
            </Txt>
          </Pressable>
        ))}
      </Row>

      {isNew ? (
        <CoachTip id="tip_first_booking" title="New here? How Sleek keeps you safe" body="1. Pick a verified artisan. 2. Agree the price in chat. 3. Pay into escrow — the artisan only gets paid after you approve the work." icon="school-outline" />
      ) : null}

      <Card onPress={() => router.push('/ugent')} style={{ marginTop: space.md, backgroundColor: '#0B3D91', borderColor: '#0B3D91' }}>
        <Row gap={space.md}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" color="#fff">
              {t('home.ugentTitle')}
            </Txt>
            <Txt v="small" color="#BFE6FB">
              {t('home.ugentBody')}
            </Txt>
          </View>
          <Icon name="chevron-forward" color="#fff" />
        </Row>
      </Card>

      {attention.length ? (
        <Section title={t('home.attention')} action={t('home.allJobs')} onAction={() => router.push('/jobs')}>
          {attention.map((j) => (
            <JobCard key={j.id} job={j} artisan={artisans.find((a) => a.id === j.artisanId)} />
          ))}
        </Section>
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Banner tone="primary" icon="lock-closed" title={t('home.escrowTitle')} body={t('home.escrowBody')} action={t('home.howItWorks')} onAction={() => router.push('/trust-safety')} />
        </View>
      )}

      {saved.length ? (
        <Section title={t('home.saved')} action={t('common.seeAll')} onAction={() => router.push('/favourites')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {saved.map((a) => {
              const free = availabilityNow(jobs, a, Date.now()) === 'available';
              return (
                <Pressable key={a.id} onPress={() => router.push({ pathname: '/artisan/[id]', params: { id: a.id } })} style={{ width: 96, alignItems: 'center' }}>
                  <View>
                    <Avatar name={a.businessName ?? a.name} color={a.avatarColor} size={56} />
                    <View style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.bg, backgroundColor: free ? c.success : c.border }} />
                  </View>
                  <Txt v="small" center numberOfLines={1} style={{ marginTop: 4 }}>
                    {(a.businessName ?? a.name).split(' ')[0]}
                  </Txt>
                  <Txt v="tiny" muted center numberOfLines={1}>
                    {categoryName(a.skills.find((s) => s.status === 'approved')?.categoryId ?? '')}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </Section>
      ) : null}

      <Section title={t('home.popular')} action="See all 60" onAction={() => router.push('/categories')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {POPULAR_CATEGORY_IDS.map((id) => {
            const cat = category(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/search', params: { categoryId: id } })}
                style={{ width: '23%', flexGrow: 1, alignItems: 'center', paddingVertical: space.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}
              >
                <Icon name={cat.icon} size={24} color={c.primary} />
                <Txt v="tiny" center numberOfLines={2} style={{ marginTop: 6, paddingHorizontal: 2 }}>
                  {cat.name.split(' ')[0].replace('/', '')}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title={t('home.topAvailable', { city: me?.city ?? '' })} action="Search" onAction={() => router.push('/search')}>
        <Txt v="small" muted style={{ marginBottom: space.sm }}>
          {t('home.rankedNote')}
        </Txt>
        {top.length ? (
          top.map((r, i) => <ArtisanCard key={r.artisan.id} artisan={r.artisan} rank={i + 1} distanceKm={r.distanceKm} />)
        ) : (
          <Card tone="soft">
            <Txt muted>No artisans match right now. Try “Book for later” in search, or relax your preferences.</Txt>
          </Card>
        )}
      </Section>
    </Screen>
  );
}
