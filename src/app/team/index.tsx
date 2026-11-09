import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Avatar, Banner, Button, Card, EmptyState, Pill, Row, Screen, Section, Stat, Toggle, Txt } from '../../components/ui';
import { categoryName } from '../../data/categories';
import { BLOCKING_STATUSES } from '../../domain/escrow';
import { identityVerified } from '../../domain/trust';
import { useMyArtisan, useStore } from '../../store';
import { space } from '../../theme';
import { windowLabel } from '../../utils/format';

export default function Team() {
  const me = useMyArtisan();
  const jobs = useStore((s) => s.jobs);
  const setWorkerActive = useStore((s) => s.setWorkerActive);
  const teamJobs = useMemo(() => jobs.filter((j) => j.artisanId === me?.id && BLOCKING_STATUSES.includes(j.status)), [jobs, me?.id]);
  if (!me) return null;
  if (me.accountType === 'individual') {
    return (
      <Screen title="Team">
        <EmptyState icon="people-outline" title="Individual account" body="Team and Agency accounts can add multiple verified workers and take more jobs at the same time. Contact support to upgrade." />
      </Screen>
    );
  }
  const unassigned = teamJobs.filter((j) => !j.workerId);
  const verifiedCount = me.workers.filter((w) => w.active && identityVerified(w.identity) && w.skills.some((s) => s.status === 'approved')).length;

  return (
    <Screen title={me.accountType === 'team' ? 'Team management' : 'Agency management'} subtitle={me.businessName} footer={<Button title="Add a worker" icon="person-add-outline" onPress={() => router.push('/team/add')} />}>
      <Row gap={space.sm}>
        <Stat label="Workers" value={String(me.workers.length)} icon="people-outline" />
        <Stat label="Job-ready" value={String(verifiedCount)} icon="checkmark-done-outline" />
        <Stat label="Booked slots" value={String(teamJobs.length)} icon="calendar-outline" />
      </Row>
      {unassigned.length ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="warning" title={`${unassigned.length} funded job(s) need a worker`} body="Assign a verified, free worker before the start time." />
          {unassigned.map((j) => (
            <Card key={j.id} style={{ marginTop: space.sm }} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}>
              <Txt v="bodyStrong">{j.title}</Txt>
              <Txt v="small" muted>
                {categoryName(j.categoryId)} · {windowLabel(j.window)}
              </Txt>
            </Card>
          ))}
        </View>
      ) : null}
      <Section title="Workers">
        {me.workers.length === 0 ? <EmptyState icon="person-add-outline" title="No workers yet" body="Add your first worker. Each one verifies their own NIN and face, then records a video for each skill." action="Add a worker" onAction={() => router.push('/team/add')} /> : null}
        {me.workers.map((w) => {
          const idOk = identityVerified(w.identity);
          const approved = w.skills.filter((s) => s.status === 'approved');
          const booked = teamJobs.filter((j) => j.workerId === w.id).length;
          return (
            <Card key={w.id} style={{ marginBottom: space.sm }} onPress={() => router.push({ pathname: '/team/[id]', params: { id: w.id } })}>
              <Row gap={space.md}>
                <Avatar name={w.name} color={w.avatarColor} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{w.name}</Txt>
                  <Txt v="small" muted numberOfLines={1}>
                    {approved.map((s) => categoryName(s.categoryId)).join(' · ') || 'No verified skills yet'}
                  </Txt>
                  <Row gap={6} style={{ marginTop: 4 }}>
                    <Pill label={idOk ? 'ID verified' : 'ID pending'} tone={idOk ? 'success' : 'warning'} />
                    {booked ? <Pill label={`${booked} booked`} tone="primary" /> : null}
                    {!w.active ? <Pill label="Inactive" tone="neutral" /> : null}
                  </Row>
                </View>
                <Toggle label={`${w.name} active`} value={w.active} onChange={(v) => setWorkerActive(w.id, v)} />
              </Row>
            </Card>
          );
        })}
      </Section>
      <Txt v="small" muted style={{ marginTop: space.md }}>
        Each worker follows the same timing rules: one job at a time, no overlaps. Your account stays available while any verified worker is free.
      </Txt>
    </Screen>
  );
}
