import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Avatar, Button, Card, KeyValue, Pill, Row, Screen, Section, Txt } from '../../components/ui';
import { categoryName } from '../../data/categories';
import { BLOCKING_STATUSES } from '../../domain/escrow';
import { identityVerified } from '../../domain/trust';
import { SKILL_STATUS_LABEL } from '../../domain/verification';
import { useMyArtisan, useStore } from '../../store';
import { space } from '../../theme';
import { windowLabel } from '../../utils/format';

export default function WorkerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMyArtisan();
  const jobs = useStore((s) => s.jobs);
  const w = me?.workers.find((x) => x.id === id);
  const booked = useMemo(() => jobs.filter((j) => j.workerId === id && BLOCKING_STATUSES.includes(j.status)).sort((a, b) => a.window.start.localeCompare(b.window.start)), [jobs, id]);
  if (!w) return <Screen title="Worker">{<Txt>Not found.</Txt>}</Screen>;
  const ok = identityVerified(w.identity);
  return (
    <Screen title={w.name} footer={<Button title={ok ? 'Verify another skill' : 'Continue verification'} onPress={() => router.push({ pathname: '/verify', params: { workerId: w.id } })} />}>
      <Row gap={space.md}>
        <Avatar name={w.name} color={w.avatarColor} size={60} />
        <View>
          <Txt v="h2">{w.name}</Txt>
          <Pill label={ok ? 'Identity verified' : 'Identity pending'} tone={ok ? 'success' : 'warning'} />
        </View>
      </Row>
      <Section title="Identity">
        <Card>
          <KeyValue k="NIN" v={w.identity.nin} />
          <KeyValue k="Liveness" v={w.identity.liveness} />
          <KeyValue k="Face match" v={w.identity.faceMatchScore ? `${Math.round(w.identity.faceMatchScore * 100)}%` : w.identity.faceMatch} />
        </Card>
      </Section>
      <Section title="Skills">
        {w.skills.length ? (
          w.skills.map((s) => <KeyValue key={s.categoryId} k={categoryName(s.categoryId)} v={SKILL_STATUS_LABEL[s.status]} />)
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
    </Screen>
  );
}
