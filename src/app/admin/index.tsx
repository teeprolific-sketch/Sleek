import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Logo } from '../../components/Logo';
import { Banner, Card, ListItem, Row, Screen, Section, Stat, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { ACTIVE_STATUSES } from '../../domain/escrow';
import { verificationQueue } from '../../screens/adminQueue';
import { useStore } from '../../store';
import { space } from '../../theme';
import { naira } from '../../utils/format';

export default function AdminOverview() {
  const artisans = useStore((s) => s.artisans);
  const jobs = useStore((s) => s.jobs);
  const disputes = useStore((s) => s.disputes);
  const violations = useStore((s) => s.violations);
  const queue = useMemo(() => verificationQueue(artisans), [artisans]);
  const safetyOpen = useStore((s) => s.safetyAlerts.filter((a) => a.status === 'open').length);
  const claimsOpen = useStore((s) => s.guaranteeClaims.filter((g) => g.status === 'submitted').length);
  const held = jobs.filter((j) => j.escrow.state === 'held' || j.escrow.state === 'frozen').reduce((s, j) => s + j.escrow.amount, 0);
  const commission = jobs.reduce((s, j) => s + (j.escrow.commission ?? 0), 0);
  const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length;
  const repeat = useMemo(() => {
    const counts = new Map<string, number>();
    violations.forEach((v) => counts.set(v.userId, (counts.get(v.userId) ?? 0) + 1));
    return [...counts.entries()].filter(([, n]) => n >= 3).length;
  }, [violations]);

  return (
    <Screen title="Admin console" subtitle="Trust & Safety" back={false} right={<Logo height={22} />}>
      <Row gap={space.sm}>
        <Stat label="In escrow" value={naira(held)} icon="lock-closed-outline" />
        <Stat label="Commission" value={naira(commission)} icon="cash-outline" />
      </Row>
      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        <Stat label="Active jobs" value={String(active)} icon="briefcase-outline" />
        <Stat label="Artisans" value={String(artisans.length)} icon="people-outline" />
        <Stat label="Online" value={String(artisans.filter((a) => a.online).length)} icon="radio-button-on" />
      </Row>
      {repeat ? (
        <Card style={{ marginTop: space.md }}>
          <Banner tone="danger" title={`${repeat} repeat offender(s)`} body="Users with 3+ blocked contact-sharing attempts. Review for suspension." action="Open rule monitor" onAction={() => router.push('/admin/violations')} />
        </Card>
      ) : null}
      {safetyOpen ? (
        <Card style={{ marginTop: space.md, borderColor: '#DC2626', borderWidth: 2 }} onPress={() => router.push('/safety-queue')}>
          <Txt v="bodyStrong" color="#DC2626">
            🚨 {safetyOpen} open safety alert(s)
          </Txt>
          <Txt v="small" muted>
            Handle these first.
          </Txt>
        </Card>
      ) : null}
      <Section title="Queues">
        <ListItem icon="shield-outline" title="Safety & protection" subtitle={`${safetyOpen} open alerts · ${claimsOpen} protection claims`} onPress={() => router.push('/safety-queue')} />
        <ListItem icon="finger-print-outline" title="Skill verification" subtitle={`${queue.length} video(s) waiting · ${queue.filter((q) => category(q.skill.categoryId).risk === 'high').length} high-risk`} onPress={() => router.push('/admin/verifications')} />
        <ListItem icon="flag-outline" title="Disputes" subtitle={`${disputes.filter((d) => d.status !== 'resolved').length} open`} onPress={() => router.push('/admin/disputes')} />
        <ListItem icon="ban-outline" title="Rule-breaking monitor" subtitle={`${violations.filter((v) => !v.reviewed).length} unreviewed attempts`} onPress={() => router.push('/admin/violations')} />
      </Section>
      <Txt v="small" muted style={{ marginTop: space.lg }}>
        Every admin decision is recorded on the job timeline and visible to both parties.
      </Txt>
    </Screen>
  );
}
