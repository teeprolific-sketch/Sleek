import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Card, Field, Icon, KeyValue, Screen, Section, Steps, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { PROTECTION_DAYS, protectionCover, protectionEligible, protectionWindow } from '../../domain/protection';
import type { CapturedMedia } from '../../domain/types';
import { useJob, useStore } from '../../store';
import { radius, useTheme } from '../../theme';
import { requestCapture } from '../../utils/captureBus';
import { day, naira } from '../../utils/format';

/** Sleek Protection: a limited guarantee claim within 7 days of approval. */
export default function ProtectionClaim() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const claim = useStore((s) => s.guaranteeClaims.find((g) => g.jobId === id));
  const submit = useStore((s) => s.submitGuaranteeClaim);
  const logCapture = useStore((s) => s.logCapture);
  const [details, setDetails] = useState('');
  const [evidence, setEvidence] = useState<CapturedMedia[]>([]);
  if (!job || !artisan) return <Screen title="Sleek Protection">{<Txt>Not found.</Txt>}</Screen>;
  const elig = protectionEligible(job, artisan, category(job.categoryId), Date.now());
  const win = protectionWindow(job);

  if (claim) {
    return (
      <Screen title="Your protection claim">
        <Card>
          <Steps current={claim.status === 'submitted' ? 1 : 3} steps={['Claim submitted', 'Sleek reviews your photos and the job record', 'Decision']} />
        </Card>
        <Banner tone={claim.status === 'approved' ? 'success' : claim.status === 'declined' ? 'neutral' : 'info'} body={claim.status === 'approved' ? `Approved — ${naira(claim.payout ?? 0)} will be paid to your original payment method.` : claim.status === 'declined' ? 'This issue wasn’t covered. Contact Help & Support if you disagree.' : 'We usually decide within 3 working days.'} />
        <Txt style={{ marginTop: 12 }}>{claim.details}</Txt>
      </Screen>
    );
  }

  return (
    <Screen title="Sleek Protection claim" footer={elig.eligible && win.open ? <Button title="Submit claim" onPress={() => { const r = submit(job.id, details, evidence); if (!r.ok) return showMessage('Not submitted', r.error); router.back(); }} /> : undefined}>
      <Card tone="soft">
        <Icon name="ribbon-outline" size={28} color={c.primary} />
        <Txt v="h3" style={{ marginTop: 6 }}>
          Covered for {PROTECTION_DAYS} days after approval
        </Txt>
        <Txt v="small" muted>
          If the work fails because of how it was done, Sleek can pay up to {naira(protectionCover(job))}. Accidental damage after the job and new problems aren’t covered.
        </Txt>
        <KeyValue k="Job" v={job.title} />
        {win.until ? <KeyValue k="Claim by" v={day(win.until)} /> : null}
      </Card>
      {!elig.eligible ? <Banner tone="neutral" body={elig.reason ?? 'Not eligible.'} /> : null}
      <Section title="What went wrong?">
        <Field multiline value={details} onChangeText={setDetails} placeholder="When did you notice it? What exactly failed?" />
      </Section>
      <Section title="Photos">
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {evidence.map((p) => (
            <Image key={p.id} source={{ uri: p.uri }} style={{ width: 84, height: 84, borderRadius: radius.md }} />
          ))}
          <Pressable onPress={() => requestCapture('dispute_evidence', (uri) => setEvidence((e) => [...e, logCapture('dispute_evidence', uri, job.id)]), job.id)} style={{ width: 84, height: 84, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera-outline" color={c.primary} />
          </Pressable>
        </ScrollView>
      </Section>
    </Screen>
  );
}
