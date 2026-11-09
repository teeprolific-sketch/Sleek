import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Banner, Card, Row, Screen, Section, Stat, Txt } from '../components/ui';
import { artisanInsights } from '../domain/insights';
import { rankScore } from '../domain/ranking';
import { trustScore } from '../domain/trust';
import { useMyArtisan, useStore } from '../store';
import { radius, space, useTheme } from '../theme';
import { naira } from '../utils/format';

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

/** Performance insights: acceptance, completion, rating trend, earnings trend. */
export default function Insights() {
  const { c } = useTheme();
  const me = useMyArtisan();
  const jobs = useStore((s) => s.jobs);
  const reviews = useStore((s) => s.reviews);
  const ledger = useStore((s) => s.ledger);
  const ins = useMemo(() => (me ? artisanInsights(me.id, jobs, reviews, ledger, Date.now()) : null), [me, jobs, reviews, ledger]);
  if (!me || !ins) return null;
  const score = rankScore(me, undefined, Date.now());
  const maxEarn = Math.max(1, ...ins.earningsTrend.map((m) => m.amount));
  const tips: string[] = [];
  if (ins.acceptanceRate != null && ins.acceptanceRate < 0.6) tips.push('Reply to more requests — artisans who agree a price quickly get booked more.');
  if (me.stats.onTimeRate < 0.9) tips.push('Tap “I’m on my way” and start on time: punctuality is part of your ranking.');
  if (ins.cancelledByArtisan > 0) tips.push('Avoid cancelling funded jobs — it lowers your trust score. Use time off to block days instead.');
  if (me.skills.filter((s) => s.status === 'approved').length < 2) tips.push('Verify another skill to appear in more searches.');
  if (!tips.length) tips.push('You’re doing great. Keep your schedule up to date and ask happy customers to leave a review.');

  return (
    <Screen title="Performance insights" subtitle="Last 6 months">
      <Row gap={space.sm}>
        <Stat label="Acceptance rate" value={pct(ins.acceptanceRate)} icon="checkmark-circle-outline" />
        <Stat label="Completion rate" value={pct(ins.completionRate)} icon="checkmark-done-outline" />
      </Row>
      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        <Stat label="Avg rating" value={ins.avgRating ? ins.avgRating.toFixed(1) : '—'} icon="star-outline" />
        <Stat label="On time" value={pct(me.stats.onTimeRate)} icon="time-outline" />
        <Stat label="Trust score" value={String(trustScore(me, Date.now()))} icon="shield-checkmark-outline" />
      </Row>

      <Section title="Earnings by month">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 8 }}>
            {ins.earningsTrend.map((m) => (
              <View key={m.month} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} accessible accessibilityLabel={`${m.month}: ${naira(m.amount)}`}>
                <Txt v="tiny" muted numberOfLines={1}>
                  {m.amount ? `${Math.round(m.amount / 1000)}k` : ''}
                </Txt>
                <View style={{ width: '70%', height: `${Math.max(2, (m.amount / maxEarn) * 80)}%`, backgroundColor: c.primary, borderRadius: radius.sm }} />
                <Txt v="tiny" muted style={{ marginTop: 4 }}>
                  {m.month}
                </Txt>
              </View>
            ))}
          </View>
          <Txt v="small" muted style={{ marginTop: space.sm }}>
            Includes job payments, tips and bonuses. Tips: {naira(ins.tips)} · Commission paid: {naira(ins.commissionPaid)}
          </Txt>
        </Card>
      </Section>

      <Section title="Rating trend">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 8 }}>
            {ins.ratingTrend.map((m) => (
              <View key={m.month} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} accessible accessibilityLabel={`${m.month}: ${m.avg ? m.avg.toFixed(1) : 'no'} rating`}>
                <Txt v="tiny" muted>
                  {m.avg ? m.avg.toFixed(1) : '–'}
                </Txt>
                <View style={{ width: '70%', height: m.avg ? `${(m.avg / 5) * 75}%` : 2, backgroundColor: m.avg && m.avg >= 4.5 ? c.success : m.avg ? c.warning : c.border, borderRadius: radius.sm }} />
                <Txt v="tiny" muted style={{ marginTop: 4 }}>
                  {m.month}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Jobs">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt>Requests received</Txt>
            <Txt v="bodyStrong">{ins.requests}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Txt>Price agreed</Txt>
            <Txt v="bodyStrong">{ins.accepted}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Txt>Completed</Txt>
            <Txt v="bodyStrong">{ins.completed}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Txt>You cancelled</Txt>
            <Txt v="bodyStrong" color={ins.cancelledByArtisan ? c.danger : undefined}>
              {ins.cancelledByArtisan}
            </Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Txt>Disputes</Txt>
            <Txt v="bodyStrong">{ins.disputes}</Txt>
          </Row>
        </Card>
      </Section>

      <Section title="Your ranking">
        <Card>
          {(
            [
              ['Verification', score.verification, 30],
              ['Experience', score.experience, 20],
              ['Ratings', score.rating, 25],
              ['Reliability', score.reliability, 15],
              ['Proof-of-work quality', score.proofQuality, 10],
            ] as const
          ).map(([label, v, max]) => (
            <View key={label} style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="small">{label}</Txt>
                <Txt v="small" muted>
                  {v.toFixed(1)} / {max}
                </Txt>
              </Row>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border, marginTop: 3 }}>
                <View style={{ width: `${Math.min(100, (v / max) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
              </View>
            </View>
          ))}
          {score.penalties < 0 ? (
            <Txt v="small" color={c.danger}>
              Penalties: {score.penalties.toFixed(1)} (lost disputes or chat rule breaks)
            </Txt>
          ) : null}
        </Card>
      </Section>

      <Section title="How to improve">
        {tips.map((t) => (
          <View key={t} style={{ marginBottom: space.sm }}>
            <Banner tone="info" icon="bulb-outline" body={t} />
          </View>
        ))}
      </Section>
    </Screen>
  );
}
