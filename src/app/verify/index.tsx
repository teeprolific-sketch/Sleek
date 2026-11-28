import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Card, Chip, Field, Icon, ListItem, Pill, Row, Screen, Section, Steps, Txt } from '../../components/ui';
import { CATEGORIES, category } from '../../data/categories';
import { identityVerified } from '../../domain/trust';
import type { SkillVerification } from '../../domain/types';
import { nextIdentityStep, SKILL_STATUS_LABEL } from '../../domain/verification';
import { useMyArtisan, useMySeller, useStore } from '../../store';
import { allDone, artisanSteps, sellerSteps, type Step } from '../../domain/activation';
import { showMessage } from '../../components/domain';
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
  const seller = useMySeller();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const worker = me?.workers.find((w) => w.id === workerId);
  const identity = worker?.identity ?? me?.identity;
  const skills = worker?.skills ?? me?.skills ?? [];
  const list = useMemo(() => CATEGORIES.filter((x) => !skills.some((s) => s.categoryId === x.id) && x.name.toLowerCase().includes(q.toLowerCase())), [skills, q]);
  if (seller) return <SellerVerify />;
  if (!me || !identity) return null;
  const liveSkills = [...me.skills, ...me.workers.flatMap((w) => w.skills)].filter((k) => k.status === 'approved').length;
  const step = nextIdentityStep(identity);
  const stepIndex = { nin: 0, liveness: 1, face_match: 1, done: 3 }[step];
  const verified = identityVerified(identity);
  const who = worker ? worker.name : 'you';
  const wq = workerId ? { workerId } : {};

  return (
    <Screen title={worker ? `Verify ${worker.name}` : 'Verification'} subtitle="Every check must pass before your account opens" back={!!worker || !!me.activatedAt}>
      {!worker ? <Checklist steps={artisanSteps(me)} active={!!me.activatedAt} kind="artisan" /> : null}
      {!worker && me.activatedAt && liveSkills > 0 ? (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="success" icon="rocket-outline" title="Your account is open" body={`${liveSkills} verified skill${liveSkills === 1 ? '' : 's'}. Go online to start receiving jobs.`} action="Go to dashboard" onAction={() => router.replace('/dashboard')} />
        </View>
      ) : null}
      <Section title="1. Identity">
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

      {!worker ? <GuarantorSection guarantor={me.guarantor} n={2} /> : null}
      {!worker && me.accountType !== 'individual' ? (
        <Section title="3. Business registration (CAC)">
          <Card>
            <Txt v="small" muted>
              {me.business?.completedOnboarding ? (me.business.cacPending ? 'Not registered yet: flagged for review.' : `CAC ${me.business.cacNumber} · areas: ${me.business.serviceAreas.join(', ')}`) : 'Add your CAC number, service areas and team size.'}
            </Txt>
            <Button small style={{ marginTop: space.sm }} variant={me.business?.completedOnboarding ? 'ghost' : 'primary'} title={me.business?.completedOnboarding ? 'Edit business details' : 'Add business details'} onPress={() => router.push('/onboarding-business')} />
          </Card>
        </Section>
      ) : null}

      <Section title={`${!worker && me.accountType !== 'individual' ? 4 : worker ? 2 : 3}. Skills — one live video per skill`}>
        <Txt v="small" muted style={{ marginBottom: space.sm }}>
          For each skill {who} want{worker ? 's' : ''} to offer, record a live video of real work in the app (30 seconds to 3 minutes). Your face must be visible and match your identity. A video that passes the checks is approved instantly.
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
                    ) : s.status === 'approved' ? (
                      <Txt v="small" muted>
                        {s.postReview === 'confirmed' ? 'Live · audited by the Trust team' : 'Live now · the Trust team will audit it and email you if anything is needed'}
                      </Txt>
                    ) : s.status === 'in_review' ? (
                      <Txt v="small" muted>
                        A reviewer is checking your video.
                      </Txt>
                    ) : null}
                  </View>
                  <Pill label={SKILL_STATUS_LABEL[s.status]} tone={TONE[s.status]} />
                </Row>
                {redo ? <Button small variant="secondary" title="See what to fix & re-submit" style={{ marginTop: space.md }} onPress={() => router.push({ pathname: '/verify/resubmit', params: { categoryId: s.categoryId, ...wq } })} /> : null}
                {cat.risk === 'high' && s.status === 'in_review' && !s.certificate ? <Button small variant="ghost" title="Add certificate photo" style={{ marginTop: space.sm }} onPress={() => router.push({ pathname: '/verify/resubmit', params: { categoryId: s.categoryId, ...wq } })} /> : null}
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
              <Field placeholder="Search a trade (100 available)" value={q} onChangeText={setQ} autoFocus />
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

/** Sleek Services sellers verify their identity only; the store opens the moment it passes. */
function SellerVerify() {
  const seller = useMySeller()!;
  const identity = seller.identity;
  const step = nextIdentityStep(identity);
  const verified = identityVerified(identity);
  return (
    <Screen title="Verification" subtitle="Every check must pass before your store opens" back={!!seller.activatedAt}>
      <Checklist steps={sellerSteps(seller)} active={!!seller.activatedAt} kind="seller" />
      <Section title="1. Identity">
      <Card>
        <Steps current={{ nin: 0, liveness: 1, face_match: 1, done: 3 }[step]} steps={['NIN check with NIMC', 'Face liveness (random movements)', 'Face match with NIN photo']} />
        {verified ? (
          <View style={{ marginTop: space.md }}>
            <Banner tone="success" icon="checkmark-circle" title="Identity verified" body={`Face match ${Math.round((identity.faceMatchScore ?? 0) * 100)}% · NIN ending ${identity.ninLast4}.`} />
          </View>
        ) : (
          <Button style={{ marginTop: space.md }} title={step === 'nin' ? 'Verify NIN' : 'Start face check'} icon={step === 'nin' ? 'id-card-outline' : 'scan-outline'} onPress={() => router.push(step === 'nin' ? '/verify/nin' : '/verify/liveness')} />
        )}
      </Card>
      </Section>
      <GuarantorSection guarantor={seller.guarantor} n={2} />
      <SellerCac />
      <View style={{ marginTop: space.lg }}>
        <Banner tone="primary" icon="lock-closed" body="Your NIN and face data go only to our licensed verification partner. One NIN can open only one Sleek account." />
      </View>
    </Screen>
  );
}

/** The onboarding checklist and the button that opens the account once everything has passed. */
function Checklist({ steps, active, kind }: { steps: Step[]; active: boolean; kind: 'artisan' | 'seller' }) {
  const { c } = useTheme();
  const activate = useStore((s) => s.activateAccount);
  const ready = allDone(steps);
  return (
    <Card style={{ marginBottom: space.md, borderColor: active ? c.success : ready ? c.primary : c.border, borderWidth: 1.5 }}>
      <Txt v="bodyStrong">{active ? (kind === 'artisan' ? 'Your account is open' : 'Your store is open') : `Before your ${kind === 'artisan' ? 'account' : 'store'} opens`}</Txt>
      <View style={{ marginTop: space.sm, gap: 6 }}>
        {steps.map((st) => (
          <Row key={st.key} gap={8}>
            <Icon name={st.done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={st.done ? c.success : c.textMuted} />
            <View style={{ flex: 1 }}>
              <Txt v="small">{st.label}</Txt>
              {st.note ? (
                <Txt v="tiny" muted>
                  {st.note}
                </Txt>
              ) : null}
            </View>
          </Row>
        ))}
      </View>
      {!active ? (
        <Button
          style={{ marginTop: space.md }}
          title={ready ? (kind === 'artisan' ? 'Open my account' : 'Open my store') : 'Finish the steps below'}
          icon={ready ? 'rocket-outline' : undefined}
          disabled={!ready}
          onPress={() => {
            const r = activate();
            if (!r.ok) return showMessage('Not yet', r.error);
            showMessage('You’re verified', 'Every check passed. We’ve emailed you a confirmation.');
            router.replace(kind === 'artisan' ? '/dashboard' : '/seller');
          }}
        />
      ) : null}
    </Card>
  );
}

function GuarantorSection({ guarantor, n }: { guarantor?: { name: string; status: string; relationship: string }; n: number }) {
  return (
    <Section title={`${n}. Guarantor`}>
      <Card>
        {guarantor?.status === 'confirmed' ? (
          <Banner tone="success" title="Guarantor confirmed" body={`${guarantor.name} · ${guarantor.relationship}`} />
        ) : (
          <>
            <Txt v="small" muted>
              {guarantor ? `${guarantor.name} hasn’t confirmed yet.` : 'Someone who has known you for at least a year confirms by SMS that they vouch for you.'}
            </Txt>
            <Button small style={{ marginTop: space.sm }} title={guarantor ? 'Finish guarantor confirmation' : 'Add a guarantor'} icon="people-outline" onPress={() => router.push('/verify/guarantor')} />
          </>
        )}
      </Card>
    </Section>
  );
}

function SellerCac() {
  const seller = useMySeller()!;
  const setReg = useStore((s) => s.setBusinessRegistration);
  const [cac, setCac] = useState(seller.cacNumber ?? '');
  const [none, setNone] = useState(!!seller.cacPending);
  const [error, setError] = useState<string | null>(null);
  const saved = !!seller.cacNumber || !!seller.cacPending;
  return (
    <Section title="3. Business registration (CAC)">
      <Card>
        {!none ? <Field label="CAC number" value={cac} onChangeText={setCac} placeholder="e.g. RC 1234567 or BN 1234567" autoCapitalize="characters" error={error} /> : null}
        <Row gap={8} style={{ marginBottom: space.sm }}>
          <Chip label="Not registered with CAC yet" icon={none ? 'checkbox' : 'square-outline'} selected={none} onPress={() => setNone(!none)} />
        </Row>
        {none ? <Txt v="small" muted>You can still open your store. It’s flagged for review until you add your CAC number.</Txt> : null}
        <Button small style={{ marginTop: space.sm }} variant={saved ? 'ghost' : 'primary'} title={saved ? 'Update' : 'Save'} onPress={() => { const r = setReg({ cacNumber: cac, notRegistered: none }); setError(r.ok ? null : r.error); if (r.ok) showMessage('Saved', none ? 'Flagged for review: add your CAC number when you have it.' : 'CAC number checked.'); }} />
      </Card>
    </Section>
  );
}
