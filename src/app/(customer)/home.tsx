import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ArtisanCard, JobCard } from '../../components/domain';
import { Banner, Card, Icon, IconButton, Row, Screen, Section, Txt } from '../../components/ui';
import { category, categoryName, POPULAR_CATEGORY_IDS } from '../../data/categories';
import { searchAvailable } from '../../domain/ranking';
import { useMyCustomer, useStore, useUnreadCount } from '../../store';
import { radius, space, useTheme } from '../../theme';

export default function CustomerHome() {
  const { c } = useTheme();
  const me = useMyCustomer();
  const artisans = useStore((s) => s.artisans);
  const jobs = useStore((s) => s.jobs);
  const unread = useUnreadCount();
  const [q, setQ] = useState('');

  const top = useMemo(() => searchAvailable(artisans, jobs, { city: me?.city, categoryName }, Date.now()).slice(0, 5), [artisans, jobs, me?.city]);
  const attention = useMemo(
    () => jobs.filter((j) => j.customerId === me?.id && ['proof_submitted', 'price_agreed', 'requested', 'funded', 'in_progress', 'disputed'].includes(j.status)).slice(0, 2),
    [jobs, me?.id],
  );

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <Screen back={false}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Txt muted>{greet},</Txt>
          <Txt v="h1">{me?.name.split(' ')[0] ?? 'there'} 👋</Txt>
        </View>
        <IconButton icon="notifications-outline" label="Notifications" badge={unread} onPress={() => router.push('/notifications')} />
      </Row>

      <Pressable onPress={() => router.push({ pathname: '/search', params: { q } })} style={{ marginTop: space.lg }}>
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 50 }}>
          <Icon name="search-outline" color={c.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="What do you need done?"
            placeholderTextColor={c.textMuted}
            style={{ flex: 1, color: c.text, fontSize: 16, minHeight: 48 }}
            returnKeyType="search"
            onSubmitEditing={() => router.push({ pathname: '/search', params: { q } })}
          />
        </View>
      </Pressable>

      <Card onPress={() => router.push('/ugent')} style={{ marginTop: space.md, backgroundColor: '#0B3D91', borderColor: '#0B3D91' }}>
        <Row gap={space.md}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" color="#fff">
              Ask Ugent to book for you
            </Txt>
            <Txt v="small" color="#BFE6FB">
              “Find a mechanic in Yaba tomorrow morning.” You confirm every step.
            </Txt>
          </View>
          <Icon name="chevron-forward" color="#fff" />
        </Row>
      </Card>

      {attention.length ? (
        <Section title="Needs your attention" action="All jobs" onAction={() => router.push('/jobs')}>
          {attention.map((j) => (
            <JobCard key={j.id} job={j} artisan={artisans.find((a) => a.id === j.artisanId)} />
          ))}
        </Section>
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Banner tone="primary" icon="lock-closed" title="Pay safely with escrow" body="Your money is held by Sleek and released only after you approve the work." action="How it works" onAction={() => router.push('/trust-safety')} />
        </View>
      )}

      <Section title="Popular services" action="See all 60" onAction={() => router.push('/categories')}>
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

      <Section title={`Top available in ${me?.city ?? 'your city'}`} action="Search" onAction={() => router.push('/search')}>
        <Txt v="small" muted style={{ marginBottom: space.sm }}>
          Ranked by verification, completed jobs, ratings and reliability. Only artisans available right now are shown.
        </Txt>
        {top.length ? (
          top.map((r, i) => <ArtisanCard key={r.artisan.id} artisan={r.artisan} rank={i + 1} />)
        ) : (
          <Card tone="soft">
            <Txt muted>No artisans are available in your city right now. Try “Book for later” in search.</Txt>
          </Card>
        )}
      </Section>
    </Screen>
  );
}
