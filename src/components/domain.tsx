import { router } from 'expo-router';
import React from 'react';
import { Alert, Platform, View } from 'react-native';
import { category, categoryName } from '../data/categories';
import { AVAILABILITY_LABEL, type AvailabilityState } from '../domain/availability';
import { STATUS_LABEL, STATUS_TONE } from '../domain/escrow';
import { badgesFor, displayRating, type Badge } from '../domain/trust';
import type { Artisan, Job } from '../domain/types';
import { useT, type TKey } from '../i18n';
import { openDialog } from './dialog';
import { space, useTheme } from '../theme';
import { AutoReleaseCountdown, EscrowBadge } from './feedback';
import { FavouriteButton } from './jobParts';
import { naira, windowLabel } from '../utils/format';
import { Avatar, Card, Icon, Pill, Row, Stars, Txt } from './ui';

/** Cross-platform alert/confirm (Alert is a no-op on web). */
export function showMessage(title: string, message?: string) {
  if (Platform.OS === 'web') openDialog({ title, message });
  else Alert.alert(title, message);
}

export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void, destructive = false) {
  if (Platform.OS === 'web') {
    openDialog({ title, message, confirmLabel, destructive, onConfirm });
    return;
  }
  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function JobStatusPill({ status }: { status: Job['status'] }) {
  const t = useT();
  return <Pill label={t(`status.${status}` as TKey) || STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}

export function AvailabilityPill({ state }: { state: AvailabilityState }) {
  const tone = state === 'available' ? 'success' : state === 'on_job' ? 'primary' : state === 'fully_booked' ? 'warning' : 'neutral';
  return <Pill label={AVAILABILITY_LABEL[state]} tone={tone} icon={state === 'available' ? 'radio-button-on' : undefined} />;
}

const BADGE_ICON: Record<Badge['kind'], string> = {
  identity: 'finger-print-outline',
  skill: 'ribbon-outline',
  trusted: 'shield-checkmark',
  team: 'people-outline',
  agency: 'business-outline',
};

export function BadgeRow({ artisan, limit, only }: { artisan: Artisan; limit?: number; only?: string }) {
  const badges = badgesFor(artisan, Date.now(), categoryName).filter((b) => !only || b.kind !== 'skill' || b.categoryId === only);
  const shown = limit ? badges.slice(0, limit) : badges;
  return (
    <Row wrap gap={6}>
      {shown.map((b) => (
        <Pill key={b.label} label={b.label} icon={BADGE_ICON[b.kind]} tone={b.kind === 'trusted' ? 'success' : b.kind === 'identity' ? 'primary' : 'info'} />
      ))}
    </Row>
  );
}

export function ArtisanCard({ artisan, categoryId, rank, freeWorkers, distanceKm }: { artisan: Artisan; categoryId?: string; rank?: number; freeWorkers?: number; distanceKm?: number | null }) {
  const { c } = useTheme();
  const rating = displayRating(artisan);
  const price = categoryId ? artisan.startingPrices[categoryId] : Object.values(artisan.startingPrices)[0];
  return (
    <Card onPress={() => router.push({ pathname: '/artisan/[id]', params: { id: artisan.id, categoryId: categoryId ?? '' } })} style={{ marginBottom: space.md }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <Avatar name={artisan.businessName ?? artisan.name} color={artisan.avatarColor} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>
              {artisan.businessName ?? artisan.name}
            </Txt>
            {rank ? (
              <Txt v="tiny" muted>
                #{rank}
              </Txt>
            ) : null}
            <FavouriteButton artisanId={artisan.id} size={20} />
          </Row>
          <Txt v="small" muted numberOfLines={1}>
            {artisan.skills.filter((s) => s.status === 'approved').map((s) => categoryName(s.categoryId)).join(' · ')}
          </Txt>
          <Row gap={6}>
            <Stars value={rating} size={13} />
            <Txt v="small" muted>
              {rating.toFixed(1)} · {artisan.stats.completedJobs} jobs
            </Txt>
          </Row>
          <Row gap={4}>
            <Icon name="location-outline" size={13} color={c.textMuted} />
            <Txt v="small" muted>
              {artisan.area}, {artisan.city}
              {distanceKm != null ? ` · ${distanceKm < 1 ? 'same area' : `~${distanceKm} km`}` : ''}
            </Txt>
            {freeWorkers && artisan.accountType !== 'individual' ? (
              <Txt v="small" color={c.success}>
                {' '}
                · {freeWorkers} free
              </Txt>
            ) : null}
          </Row>
          <View style={{ marginTop: 4 }}>
            <BadgeRow artisan={artisan} limit={3} only={categoryId} />
          </View>
        </View>
      </Row>
      {price ? (
        <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
          <Txt v="small" muted>
            From
          </Txt>
          <Txt v="bodyStrong">{naira(price)}</Txt>
        </Row>
      ) : null}
    </Card>
  );
}

export function JobCard({ job, artisan, counterpartName, onPress }: { job: Job; artisan?: Artisan; counterpartName?: string; onPress?: () => void }) {
  const { c } = useTheme();
  const cat = category(job.categoryId);
  return (
    <Card onPress={onPress ?? (() => router.push({ pathname: '/job/[id]', params: { id: job.id } }))} style={{ marginBottom: space.md }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Row gap={space.md} style={{ flex: 1 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={cat.icon} size={20} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" numberOfLines={1}>
              {job.title}
            </Txt>
            <Txt v="small" muted numberOfLines={1}>
              {counterpartName ?? artisan?.businessName ?? artisan?.name} · {cat.name}
            </Txt>
          </View>
        </Row>
        <JobStatusPill status={job.status} />
      </Row>
      <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
        <Row gap={4}>
          <Icon name="time-outline" size={14} color={c.textMuted} />
          <Txt v="small" muted>
            {windowLabel(job.window)}
          </Txt>
        </Row>
        <Txt v="bodyStrong">{job.pricePool.locked ? naira(job.pricePool.locked.amount) : 'Price not set'}</Txt>
      </Row>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <EscrowBadge job={job} compact />
        <AutoReleaseCountdown job={job} compact />
      </Row>
      {job.origin === 'ugent' ? (
        <Row gap={4} style={{ marginTop: 6 }}>
          <Icon name="sparkles" size={12} color={c.primary} />
          <Txt v="tiny" color={c.primary}>
            BOOKED VIA UGENT
          </Txt>
        </Row>
      ) : null}
    </Card>
  );
}
