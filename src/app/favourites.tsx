import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { AvailabilityPill } from '../components/domain';
import { FavouriteButton } from '../components/jobParts';
import { Avatar, Button, Card, EmptyState, Row, Screen, Stars, Txt } from '../components/ui';
import { categoryName } from '../data/categories';
import { availabilityNow } from '../domain/availability';
import { displayRating } from '../domain/trust';
import { useT } from '../i18n';
import { useMyCustomer, useStore } from '../store';
import { space } from '../theme';
import { day } from '../utils/format';

/** Saved / favourite artisans with one-tap rebook. */
export default function Favourites() {
  const t = useT();
  const me = useMyCustomer();
  const artisans = useStore((s) => s.artisans);
  const jobs = useStore((s) => s.jobs);
  const saved = useMemo(() => artisans.filter((a) => me?.favourites?.includes(a.id)), [artisans, me?.favourites]);
  const now = Date.now();
  return (
    <Screen title="Saved artisans" subtitle={saved.length ? `${saved.length} saved` : undefined}>
      {saved.length ? (
        saved.map((a) => {
          const state = availabilityNow(jobs, a, now);
          const last = jobs.filter((j) => j.artisanId === a.id && j.customerId === me?.id && j.status === 'completed').sort((x, y) => y.window.start.localeCompare(x.window.start))[0];
          const cat = last?.categoryId ?? a.skills.find((s) => s.status === 'approved')?.categoryId ?? a.workers.flatMap((w) => w.skills).find((s) => s.status === 'approved')?.categoryId;
          return (
            <Card key={a.id} style={{ marginBottom: space.md }} onPress={() => router.push({ pathname: '/artisan/[id]', params: { id: a.id } })}>
              <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                <Avatar name={a.businessName ?? a.name} color={a.avatarColor} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
                      {a.businessName ?? a.name}
                    </Txt>
                    <FavouriteButton artisanId={a.id} />
                  </Row>
                  <Row gap={6}>
                    <Stars value={displayRating(a)} size={12} />
                    <Txt v="small" muted>
                      {displayRating(a).toFixed(1)} · {a.area}
                    </Txt>
                  </Row>
                  <AvailabilityPill state={state} />
                  {last ? (
                    <Txt v="small" muted>
                      Last job: {last.title} · {day(last.window.start)}
                    </Txt>
                  ) : null}
                </View>
              </Row>
              {cat ? (
                <Button
                  small
                  style={{ marginTop: space.md }}
                  title={state === 'offline' ? 'Offline — book for later' : `Book again · ${categoryName(cat)}`}
                  icon="repeat-outline"
                  variant={state === 'available' ? 'primary' : 'secondary'}
                  onPress={() => router.push({ pathname: '/book/[id]', params: { id: a.id, categoryId: cat, title: last?.title ?? '', description: last?.description ?? '', rebook: last ? '1' : '' } })}
                />
              ) : null}
            </Card>
          );
        })
      ) : (
        <EmptyState icon="heart-outline" title={t('empty.favourites')} body={t('empty.favouritesBody')} action="Find an artisan" onAction={() => router.push('/search')} />
      )}
    </Screen>
  );
}
