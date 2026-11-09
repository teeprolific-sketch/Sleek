import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Card, Field, Icon, ListItem, Pill, Row, Screen, Section, Steps, Txt } from '../../components/ui';
import { CATEGORIES, category } from '../../data/categories';
import { identityVerified } from '../../domain/trust';
import type { SkillVerification } from '../../domain/types';
import { nextIdentityStep, SKILL_STATUS_LABEL } from '../../domain/verification';
import { useMyArtisan } from '../../store';
import { space, useTheme } from '../../theme';

const TONE: Record<SkillVerification['status'], 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  approved: 'success',
  in_review: 'warning',
  submitted: 'info',
  rejected: 'danger',
  needs_more: 'warning',
  not_started: 'neutral',
};

/** Verification hub for the account owner, or for a team worker (?workerId=). */
export default function VerifyHub() {
  const { c } = useTheme();
  const { workerId } = useLocalSearchParams<{ workerId?: string }>();
  const me = useMyArtisan();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const worker = me?.workers.find((w) => w.id === workerId);
  const identity = worker?.identity ?? me?.identity;
  const skills = worker?.skills ?? me?.skills ?? [];
  const list = useMemo(() => CATEGORIES.filter((x) => !skills.some((s) => s.categoryId === x.id) && x.name.toLowerCase().includes(q.toLowerCase())), [skills, q]);
  if (!me || !identity) return null;
  const step = nextIdentityStep(identity);
  const stepIndex = { nin: 0, liveness: 1, face_match: 1, done: 3 }[step];
  const verified = identityVerified(identity);
  const who = worker ? worker.name : 'you';
  const wq = workerId ? { workerId } : {};

  return (
    <Screen title={worker ? `Verify ${worker.name}` : 'Verification'} subtitle="Strict checks keep fake skills and scams off Sleek">
      <Section title="1. Identity" style={{ marginTop: 0 }}>
        <Card>
          <Steps current={stepIndex} steps={['NIN check with NIMC', 'Face liveness (random movements)', 'Face match with NIN photo']} />
          {verified ? (
            <View style={{ marginTop: space.md }}>
              <Banner tone="success" title="Identity verified" body={`Face match ${Math.round((identity.faceMatchScore ?? 0) * 100)}% · NIN ending ${identity.ninLast4}`} />
            </View>
          ) : (
            <Button
              style={{ marginTop: space.md }}
              title={step === 'nin' ? 'Verify NIN' : 'Start face check'}
              icon={step === 'nin' ? 'id-card-outline' : 'scan-outline'}
              onPress={() => router.push({ pathname: step === 'nin' ? '/verify/nin' : '/verify/liveness', params: wq })}
            />
          )}
          {identity.nin === 'failed' || identity.liveness === 'failed' || identity.faceMatch === 'failed' ? (
            <Txt v="small" color={c.danger} style={{ marginTop: 8 }}>
              A previous attempt failed. You can try again — repeated failures are reviewed by the Trust team.
            </Txt>
          ) : null}
        </Card>
      </Section>

      <Section title="2. Skills — one video per skill">
        <Txt v="small" muted style={{ marginBottom: space.sm }}>
          For each skill {who} want{worker ? 's' : ''} to offer, record a live video of real work in the app. Your face must be visible and match your identity. Each skill is approved separately.
        </Txt>
        {skills.length ? (
          skills.map((s) => {
            const cat = category(s.categoryId);
            const redo = s.status === 'rejected' || s.status === 'needs_more';
            return (
              <Card key={s.categoryId} style={{ marginBottom: space.sm }}>
                <Row gap={space.md}>
                  <Icon name={cat.icon} color={c.primary} />
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyStrong">{cat.name}</Txt>
                    {s.reviewerNote ? (
                      <Txt v="small" muted>
                        {s.reviewerNote}
                      </Txt>
                    ) : s.status === 'in_review' ? (
                      <Txt v="small" muted>
                        {cat.risk === 'high' ? 'High-risk trade: human review + certificate check.' : 'A reviewer is checking your video.'}
                      </Txt>
                    ) : null}
                  </View>
                  <Pill label={SKILL_STATUS_LABEL[s.status]} tone={TONE[s.status]} />
                </Row>
                {redo ? <Button small variant="secondary" title="Record a new video" style={{ marginTop: space.md }} onPress={() => router.push({ pathname: '/verify/skill', params: { categoryId: s.categoryId, ...wq } })} /> : null}
              </Card>
            );
          })
        ) : (
          <Card tone="soft">
            <Txt muted>No skills yet. Add your first skill below.</Txt>
          </Card>
        )}
        {verified ? (
          adding ? (
            <Card style={{ marginTop: space.sm }}>
              <Field placeholder="Search a trade (60 available)" value={q} onChangeText={setQ} autoFocus />
              {list.slice(0, 8).map((cat) => (
                <ListItem
                  key={cat.id}
                  icon={cat.icon}
                  title={cat.name}
                  subtitle={cat.risk === 'high' ? 'High-risk · extra review & certificate' : cat.group}
                  onPress={() => {
                    setAdding(false);
                    router.push({ pathname: '/verify/skill', params: { categoryId: cat.id, ...wq } });
                  }}
                />
              ))}
            </Card>
          ) : (
            <Button style={{ marginTop: space.sm }} variant="secondary" icon="add" title="Add a skill" onPress={() => setAdding(true)} />
          )
        ) : (
          <Banner tone="neutral" body="Finish identity verification to add skills." />
        )}
      </Section>

      {!worker && me.accountType !== 'individual' ? (
        <Section title="3. Your workers">
          <Txt v="small" muted style={{ marginBottom: space.sm }}>
            Every worker on your {me.accountType} must pass the same identity and skill checks before they can be assigned jobs.
          </Txt>
          <Button variant="ghost" title="Manage workers" icon="people-outline" onPress={() => router.push('/team')} />
        </Section>
      ) : null}
      <View style={{ marginTop: space.xl }}>
        <Banner tone="primary" icon="lock-closed" body="Your NIN and face data are encrypted, sent only to our licensed verification partner, and never shown to customers. Sleek keeps only the result." />
      </View>
    </Screen>
  );
}
