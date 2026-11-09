import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { AvailabilityPill, BadgeRow } from '../../components/domain';
import { Avatar, Banner, Button, Card, Divider, Icon, KeyValue, Pill, Row, Screen, Section, Stars, Stat, Txt } from '../../components/ui';
import { category, categoryName } from '../../data/categories';
import { availabilityNow } from '../../domain/availability';
import { rankScore } from '../../domain/ranking';
import { displayRating, identityVerified, trustScore } from '../../domain/trust';
import { SKILL_STATUS_LABEL } from '../../domain/verification';
import { useStore } from '../../store';
import { space, useTheme } from '../../theme';
import { day, naira } from '../../utils/format';

export default function ArtisanProfile() {
  const { c } = useTheme();
  const { id, categoryId } = useLocalSearchParams<{ id: string; categoryId?: string }>();
  const artisan = useStore((s) => s.artisans.find((a) => a.id === id));
  const jobs = useStore((s) => s.jobs);
  const allReviews = useStore((s) => s.reviews);
  const role = useStore((s) => s.session.role);
  const reviews = useMemo(() => allReviews.filter((r) => r.artisanId === id), [allReviews, id]);

  if (!artisan) return <Screen title="Artisan">{<Txt>Not found.</Txt>}</Screen>;
  const now = Date.now();
  const state = availabilityNow(jobs, artisan, now);
  const rating = displayRating(artisan);
  const score = rankScore(artisan, categoryId || undefined, now);
  const approved = artisan.skills.filter((s) => s.status === 'approved');
  const teamSkills = [...new Set(artisan.workers.flatMap((w) => w.skills.filter((s) => s.status === 'approved').map((s) => s.categoryId)))];
  const bookable = [...new Set([...approved.map((s) => s.categoryId), ...teamSkills])];
  const primaryCat = categoryId && bookable.includes(categoryId) ? categoryId : bookable[0];

  return (
    <Screen
      title={artisan.businessName ?? artisan.name}
      footer={
        role === 'customer' ? (
          <Button
            title={state === 'offline' ? 'Offline — check back later' : `Request ${category(primaryCat).name}`}
            icon="chatbubbles-outline"
            disabled={state === 'offline' || !primaryCat}
            onPress={() => router.push({ pathname: '/book/[id]', params: { id: artisan.id, categoryId: primaryCat } })}
          />
        ) : undefined
      }
    >
      <Row gap={space.lg} style={{ alignItems: 'flex-start' }}>
        <Avatar name={artisan.businessName ?? artisan.name} color={artisan.avatarColor} size={72} />
        <View style={{ flex: 1, gap: 6 }}>
          <Txt v="h2">{artisan.businessName ?? artisan.name}</Txt>
          {artisan.businessName ? (
            <Txt v="small" muted>
              Led by {artisan.name}
            </Txt>
          ) : null}
          <Row gap={6}>
            <Stars value={rating} />
            <Txt v="small" muted>
              {rating.toFixed(1)} ({artisan.stats.ratingCount} reviews)
            </Txt>
          </Row>
          <Row gap={6}>
            <AvailabilityPill state={state} />
            <Txt v="small" muted>
              {artisan.area}, {artisan.city}
            </Txt>
          </Row>
        </View>
      </Row>
      <View style={{ marginTop: space.md }}>
        <BadgeRow artisan={artisan} />
      </View>
      <Row gap={space.sm} style={{ marginTop: space.lg }}>
        <Stat label="Escrow jobs done" value={String(artisan.stats.completedJobs)} icon="checkmark-done-outline" />
        <Stat label="Trust score" value={`${trustScore(artisan, now)}`} icon="shield-checkmark-outline" />
        <Stat label="On time" value={`${Math.round(artisan.stats.onTimeRate * 100)}%`} icon="time-outline" />
      </Row>

      {artisan.bio ? (
        <Section title="About">
          <Txt>{artisan.bio}</Txt>
          <Txt v="small" muted style={{ marginTop: 6 }}>
            {artisan.yearsExperience} years experience · On Sleek since {day(artisan.joinedAt)}
          </Txt>
        </Section>
      ) : null}

      <Section title="Verified skills">
        {bookable.map((cid) => (
          <Card key={cid} style={{ marginBottom: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={space.md} style={{ flex: 1 }}>
                <Icon name={category(cid).icon} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{category(cid).name}</Txt>
                  <Txt v="small" muted>
                    Proof-of-work video approved{artisan.skills.find((s) => s.categoryId === cid)?.qualityScore ? ` · quality ${artisan.skills.find((s) => s.categoryId === cid)!.qualityScore}/5` : ''}
                  </Txt>
                </View>
              </Row>
              <Txt v="bodyStrong">{artisan.startingPrices[cid] ? `from ${naira(artisan.startingPrices[cid])}` : ''}</Txt>
            </Row>
            {role === 'customer' ? (
              <Button small variant="secondary" title="Request this service" style={{ marginTop: space.md }} onPress={() => router.push({ pathname: '/book/[id]', params: { id: artisan.id, categoryId: cid } })} />
            ) : null}
          </Card>
        ))}
        {artisan.skills
          .filter((s) => s.status !== 'approved')
          .map((s) => (
            <Row key={s.categoryId} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <Txt muted>{categoryName(s.categoryId)}</Txt>
              <Pill label={SKILL_STATUS_LABEL[s.status]} tone="neutral" />
            </Row>
          ))}
        <Txt v="small" muted style={{ marginTop: 6 }}>
          Each skill is verified separately with an in-app video of live work, matched to this person’s face.
        </Txt>
      </Section>

      {artisan.accountType !== 'individual' ? (
        <Section title={`${artisan.accountType === 'team' ? 'Team' : 'Agency'} workers`}>
          {artisan.workers.filter((w) => w.active).map((w) => (
            <Row key={w.id} gap={space.md} style={{ paddingVertical: 6 }}>
              <Avatar name={w.name} color={w.avatarColor} size={34} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{w.name}</Txt>
                <Txt v="small" muted>
                  {w.skills.filter((s) => s.status === 'approved').map((s) => categoryName(s.categoryId)).join(' · ') || 'Verification in progress'}
                </Txt>
              </View>
              {identityVerified(w.identity) ? <Icon name="finger-print-outline" size={18} color={c.success} /> : null}
            </Row>
          ))}
          <Txt v="small" muted>
            Every worker is individually identity- and skill-verified. You’ll see who is assigned before they arrive.
          </Txt>
        </Section>
      ) : null}

      <Section title="Verification">
        <Card>
          <KeyValue k="NIN check" v={artisan.identity.nin === 'passed' ? 'Passed' : 'Pending'} />
          <KeyValue k="Face liveness" v={artisan.identity.liveness === 'passed' ? 'Passed' : 'Pending'} />
          <KeyValue k="Face match" v={artisan.identity.faceMatchScore ? `${Math.round(artisan.identity.faceMatchScore * 100)}% match` : 'Pending'} />
          <Divider />
          <KeyValue k="Ranking score" v={`${score.total} / 100`} strong />
        </Card>
      </Section>

      <Section title="Reviews">
        {reviews.length ? (
          reviews.slice(0, 6).map((r) => (
            <View key={r.id} style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="bodyStrong">{r.customerName}</Txt>
                <Stars value={r.rating} size={12} />
              </Row>
              <Txt v="small" muted>
                {categoryName(r.categoryId)} · {day(r.at)} · Verified escrow job
              </Txt>
              <Txt style={{ marginTop: 4 }}>{r.comment}</Txt>
            </View>
          ))
        ) : (
          <Txt muted>No reviews yet. Reviews come only from completed escrow jobs.</Txt>
        )}
      </Section>
      <View style={{ marginTop: space.lg }}>
        <Banner tone="primary" icon="lock-closed" body="Contact details are never shown. Chat, agree a price and pay through Sleek to stay protected." />
      </View>
    </Screen>
  );
}
