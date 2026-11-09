import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { confirmAction, showMessage } from '../../components/domain';
import { Avatar, Button, Card, Field, KeyValue, Pill, Row, Screen, Section, Segmented, Stat, Toggle, Txt } from '../../components/ui';
import { categoryName } from '../../data/categories';
import { BLOCKING_STATUSES } from '../../domain/escrow';
import { identityVerified } from '../../domain/trust';
import { SKILL_STATUS_LABEL } from '../../domain/verification';
import { useMyArtisan, useStore } from '../../store';
import { space } from '../../theme';
import { day, windowLabel } from '../../utils/format';

/** Detailed team/agency member management. */
export default function WorkerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMyArtisan();
  const jobs = useStore((s) => s.jobs);
  const reviews = useStore((s) => s.reviews);
  const updateWorker = useStore((s) => s.updateWorker);
  const setWorkerActive = useStore((s) => s.setWorkerActive);
  const removeWorker = useStore((s) => s.removeWorker);
  const w = me?.workers.find((x) => x.id === id);
  const [note, setNote] = useState(w?.ownerNote ?? '');
  const mine = useMemo(() => jobs.filter((j) => j.workerId === id), [jobs, id]);
  if (!w || !me) return <Screen title="Worker">{<Txt>Not found.</Txt>}</Screen>;
  const ok = identityVerified(w.identity);
  const booked = mine.filter((j) => BLOCKING_STATUSES.includes(j.status)).sort((a, b) => a.window.start.localeCompare(b.window.start));
  const done = mine.filter((j) => j.status === 'completed');
  const ratings = reviews.filter((r) => done.some((j) => j.reviewId === r.id));
  const avg = ratings.length ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : null;

  return (
    <Screen title={w.name} footer={<Button title={ok ? 'Verify another skill' : 'Continue verification'} onPress={() => router.push({ pathname: '/verify', params: { workerId: w.id } })} />}>
      <Row gap={space.md}>
        <Avatar name={w.name} color={w.avatarColor} size={60} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="h2">{w.name}</Txt>
          <Row gap={6}>
            <Pill label={ok ? 'Identity verified' : 'Identity pending'} tone={ok ? 'success' : 'warning'} />
            <Pill label={w.role === 'supervisor' ? 'Supervisor' : 'Member'} tone="info" />
          </Row>
        </View>
        <Toggle label="Active" value={w.active} onChange={(v) => setWorkerActive(w.id, v)} />
      </Row>

      <Row gap={space.sm} style={{ marginTop: space.lg }}>
        <Stat label="Jobs done" value={String(done.length)} icon="checkmark-done-outline" />
        <Stat label="Booked" value={String(booked.length)} icon="calendar-outline" />
        <Stat label="Rating" value={avg ? avg.toFixed(1) : '—'} icon="star-outline" />
      </Row>

      <Section title="Role & permissions">
        <Segmented value={w.role ?? 'member'} onChange={(v) => updateWorker(w.id, { role: v })} options={[{ value: 'member', label: 'Member' }, { value: 'supervisor', label: 'Supervisor' }]} />
        <Txt v="small" muted style={{ marginTop: 6 }}>
          {w.role === 'supervisor' ? 'Supervisors can accept requests, assign jobs and manage the shared calendar. Payouts always go to the account owner.' : 'Members see and do the jobs assigned to them. They can’t change prices or payouts.'}
        </Txt>
      </Section>

      <Section title="Identity">
        <Card>
          <KeyValue k="NIN" v={w.identity.nin} />
          <KeyValue k="Liveness" v={w.identity.liveness} />
          <KeyValue k="Face match" v={w.identity.faceMatchScore ? `${Math.round(w.identity.faceMatchScore * 100)}%` : w.identity.faceMatch} />
          {w.joinedAt ? <KeyValue k="Joined team" v={day(w.joinedAt)} /> : null}
        </Card>
      </Section>
      <Section title="Skills">
        {w.skills.length ? (
          w.skills.map((s) => (
            <Row key={s.categoryId} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <Txt>{categoryName(s.categoryId)}</Txt>
              <Row gap={6}>
                <Pill label={SKILL_STATUS_LABEL[s.status]} tone={s.status === 'approved' ? 'success' : s.status === 'rejected' || s.status === 'needs_more' ? 'danger' : 'warning'} />
                {s.status === 'rejected' || s.status === 'needs_more' ? <Button small full={false} variant="ghost" title="Fix" onPress={() => router.push({ pathname: '/verify/resubmit', params: { categoryId: s.categoryId, workerId: w.id } })} /> : null}
              </Row>
            </Row>
          ))
        ) : (
          <Txt muted>No skills submitted yet.</Txt>
        )}
      </Section>
      <Section title="Individual calendar">
        {booked.length ? (
          booked.map((j) => (
            <Card key={j.id} style={{ marginBottom: space.sm }} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}>
              <Txt v="bodyStrong">{j.title}</Txt>
              <Txt v="small" muted>
                {windowLabel(j.window)}
              </Txt>
            </Card>
          ))
        ) : (
          <Txt muted>No booked jobs. Free for assignment in working hours.</Txt>
        )}
      </Section>
      <Section title="Private note (only you see this)">
        <Field multiline value={note} onChangeText={setNote} placeholder="e.g. Prefers Lekki jobs. Has own transport." />
        <Button small variant="secondary" title="Save note" onPress={() => { updateWorker(w.id, { ownerNote: note.trim() }); showMessage('Saved'); }} />
      </Section>
      <Button
        variant="ghost"
        title="Remove from team"
        style={{ marginTop: space.xl }}
        onPress={() =>
          confirmAction('Remove this worker?', `${w.name} will no longer be assigned jobs. Their verification stays on record.`, 'Remove', () => {
            const r = removeWorker(w.id);
            if (!r.ok) return showMessage('Can’t remove', r.error);
            router.back();
          }, true)
        }
      />
    </Screen>
  );
}
