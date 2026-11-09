import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { AvailabilityPill, BadgeRow, JobCard, showMessage } from '../../components/domain';
import { CoachTip } from '../../components/feedback';
import { Banner, Card, EmptyState, Icon, IconButton, Row, Screen, Section, Stat, Toggle, Txt } from '../../components/ui';
import { availabilityNow } from '../../domain/availability';
import { displayRating, identityVerified, trustScore } from '../../domain/trust';
import { balanceOf, useMyArtisan, useStore, useUnreadCount } from '../../store';
import { space, useTheme } from '../../theme';
import { naira } from '../../utils/format';

export default function ArtisanDashboard() {
  const { c } = useTheme();
  const me = useMyArtisan();
  const jobs = useStore((s) => s.jobs);
  const customers = useStore((s) => s.customers);
  const ledger = useStore((s) => s.ledger);
  const setOnline = useStore((s) => s.setOnline);
  const unread = useUnreadCount();

  const mine = useMemo(() => jobs.filter((j) => j.artisanId === me?.id), [jobs, me?.id]);
  if (!me) return null;
  const now = Date.now();
  const state = availabilityNow(jobs, me, now);
  const onJob = mine.filter((j) => j.status === 'in_progress');
  const upcoming = mine.filter((j) => j.status === 'funded').sort((a, b) => a.window.start.localeCompare(b.window.start));
  const pendingApproval = mine.filter((j) => j.status === 'proof_submitted');
  const requests = mine.filter((j) => j.status === 'requested' || j.status === 'price_agreed');
  const inEscrow = mine.filter((j) => j.escrow.state === 'held' || j.escrow.state === 'frozen').reduce((s, j) => s + j.escrow.amount, 0);
  const verified = identityVerified(me.identity);
  const hasSkill = me.skills.some((s) => s.status === 'approved') || me.workers.some((w) => w.skills.some((s) => s.status === 'approved'));
  const name = (id: string) => customers.find((x) => x.id === id)?.name;

  const toggle = (v: boolean) => {
    const r = setOnline(v);
    if (!r.ok) showMessage('Can’t go online yet', r.error);
  };

  return (
    <Screen back={false}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt muted>{me.businessName ? me.name : 'Welcome back,'}</Txt>
          <Txt v="h1" numberOfLines={1}>
            {me.businessName ?? me.name.split(' ')[0]}
          </Txt>
        </View>
        <IconButton icon="notifications-outline" label="Notifications" badge={unread} onPress={() => router.push('/notifications')} />
      </Row>

      <Card style={{ marginTop: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt v="bodyStrong">{me.online ? 'You’re online' : 'You’re offline'}</Txt>
            <Row gap={6}>
              <AvailabilityPill state={state} />
              <Txt v="small" muted>
                {me.online ? 'Customers can find you' : 'Hidden from search'}
              </Txt>
            </Row>
          </View>
          <Toggle value={me.online} onChange={toggle} label="Online" />
        </Row>
      </Card>

      {me.business && !me.business.completedOnboarding ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="primary" icon="business-outline" title={`Finish setting up your ${me.accountType}`} body="Business details, workers, payout account and calendar — about 5 minutes." action="Continue setup" onAction={() => router.push('/onboarding-business')} />
        </View>
      ) : null}
      <CoachTip id="tip_artisan_flow" title="How you get paid on Sleek" body="Agree a price in chat → customer pays into escrow → tap “I’m on my way”, start, upload proof → you’re paid when they approve (or automatically if they don’t respond)." icon="wallet-outline" />
      {!verified || !hasSkill ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="warning" icon="finger-print-outline" title="Finish verification to get jobs" body={!verified ? 'Verify your NIN and face first. It takes about 3 minutes.' : 'Record a proof-of-work video for at least one skill.'} action="Continue verification" onAction={() => router.push('/verify')} />
        </View>
      ) : null}

      <Row gap={space.sm} style={{ marginTop: space.lg }}>
        <Stat label="On job" value={String(onJob.length)} icon="construct-outline" />
        <Stat label="Upcoming" value={String(upcoming.length)} icon="calendar-outline" />
        <Stat label="Requests" value={String(requests.length)} icon="mail-unread-outline" />
      </Row>
      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        <Stat label="Available to withdraw" value={naira(balanceOf(ledger, me.id))} icon="wallet-outline" />
        <Stat label="Held in escrow" value={naira(inEscrow)} icon="lock-closed-outline" />
      </Row>

      {onJob.length ? (
        <Section title="On job now">
          {onJob.map((j) => (
            <JobCard key={j.id} job={j} counterpartName={name(j.customerId)} />
          ))}
        </Section>
      ) : null}
      {pendingApproval.length ? (
        <Section title="Pending approval">
          {pendingApproval.map((j) => (
            <JobCard key={j.id} job={j} counterpartName={name(j.customerId)} />
          ))}
        </Section>
      ) : null}
      <Section title="Upcoming" action={upcoming.length ? 'Schedule' : undefined} onAction={() => router.push('/schedule')}>
        {upcoming.length ? (
          upcoming.slice(0, 3).map((j) => <JobCard key={j.id} job={j} counterpartName={name(j.customerId)} />)
        ) : (
          <Card tone="soft">
            <Txt muted>No funded bookings yet. Future bookings only block their own time — you stay available for other jobs until then.</Txt>
          </Card>
        )}
      </Section>
      <Section title="New requests" action={requests.length ? 'See all' : undefined} onAction={() => router.push('/requests')}>
        {requests.length ? (
          requests.slice(0, 3).map((j) => <JobCard key={j.id} job={j} counterpartName={name(j.customerId)} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: j.id } })} />)
        ) : (
          <EmptyState icon="mail-unread-outline" title="No requests right now" body="Stay online, keep your schedule up to date and verify more skills to appear in more searches." />
        )}
      </Section>

      <Section title="Your trust">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="bodyStrong">Trust score</Txt>
            <Txt v="h2" color={c.primary}>
              {trustScore(me, now)}
            </Txt>
          </Row>
          <Txt v="small" muted style={{ marginVertical: 6 }}>
            Rating {displayRating(me).toFixed(1)} · {me.stats.completedJobs} escrow jobs · {me.stats.ruleViolations} rule warnings
          </Txt>
          <BadgeRow artisan={me} />
          <Row gap={6} style={{ marginTop: space.md }}>
            <Icon name="trending-up-outline" size={16} color={c.success} />
            <Txt v="small" muted style={{ flex: 1 }}>
              Completed escrow jobs raise your ranking. Cancellations, lost disputes and sharing contacts lower it.
            </Txt>
          </Row>
        </Card>
      </Section>

      <Section title="Quick actions">
        <Row gap={space.sm}>
          <Card style={{ flex: 1 }} onPress={() => router.push('/verify')}>
            <Icon name="ribbon-outline" color={c.primary} />
            <Txt v="bodyStrong" style={{ marginTop: 6 }}>
              Verify a skill
            </Txt>
          </Card>
          <Card style={{ flex: 1 }} onPress={() => router.push('/insights')}>
            <Icon name="stats-chart-outline" color={c.primary} />
            <Txt v="bodyStrong" style={{ marginTop: 6 }}>
              Insights
            </Txt>
          </Card>
          <Card style={{ flex: 1 }} onPress={() => router.push('/shop')}>
            <Icon name="cube-outline" color={c.primary} />
            <Txt v="bodyStrong" style={{ marginTop: 6 }}>
              Sleek Services
            </Txt>
          </Card>
          {me.accountType !== 'individual' ? (
            <Card style={{ flex: 1 }} onPress={() => router.push('/team')}>
              <Icon name="people-outline" color={c.primary} />
              <Txt v="bodyStrong" style={{ marginTop: 6 }}>
                Manage team
              </Txt>
            </Card>
          ) : null}
        </Row>
      </Section>
    </Screen>
  );
}
