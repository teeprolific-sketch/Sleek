import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { confirmAction, showMessage } from '../../components/domain';
import { Banner, Button, Card, Chip, Field, Icon, KeyValue, Pill, Row, Screen, Section, Steps, Txt } from '../../components/ui';
import { DISPUTE_REASONS } from '../../data/disputes';
import type { CapturedMedia, DisputeReason } from '../../domain/types';
import { useJob, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { requestCapture } from '../../utils/captureBus';
import { day, naira, time } from '../../utils/format';



export default function DisputeScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const dispute = useStore((s) => s.disputes.find((d) => d.jobId === id));
  const session = useStore((s) => s.session);
  const openDispute = useStore((s) => s.openDispute);
  const respondDispute = useStore((s) => s.respondDispute);
  const logCapture = useStore((s) => s.logCapture);
  const [reason, setReason] = useState<DisputeReason>('poor_quality');
  const [details, setDetails] = useState('');
  const [evidence, setEvidence] = useState<CapturedMedia[]>([]);
  const [response, setResponse] = useState('');
  if (!job) return <Screen title="Dispute">{<Txt>Not found.</Txt>}</Screen>;
  const party = session.userId === job.customerId ? 'customer' : 'artisan';

  if (!dispute) {
    const submit = () =>
      confirmAction('Open a dispute?', `${naira(job.escrow.amount)} will stay frozen in escrow until Sleek reviews the chat history, photos and proof of work.`, 'Open dispute', () => {
        const r = openDispute(job.id, reason, details, evidence);
        if (!r.ok) showMessage('Could not open dispute', r.error);
      });
    return (
      <Screen title="Open a dispute" subtitle={job.title} footer={<Button variant="danger" title="Submit dispute" icon="flag-outline" onPress={submit} />}>
        <Banner tone="primary" icon="shield-checkmark-outline" body="Your money stays safely in escrow. A Sleek reviewer reads the full in-app chat, the agreed price and all logged photos before deciding." />
        <Section title="What went wrong?">
          <Row wrap gap={8}>
            {DISPUTE_REASONS.map((r) => (
              <Chip key={r.id} label={r.label} selected={reason === r.id} onPress={() => setReason(r.id)} />
            ))}
          </Row>
        </Section>
        <Section title="Explain">
          <Field multiline value={details} onChangeText={setDetails} placeholder="Describe the problem clearly. What was agreed and what happened?" />
        </Section>
        <Section title="Evidence photos">
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {evidence.map((p) => (
              <Image key={p.id} source={{ uri: p.uri }} style={{ width: 84, height: 84, borderRadius: radius.md }} />
            ))}
            <Pressable onPress={() => requestCapture('dispute_evidence', (uri) => setEvidence((e) => [...e, logCapture('dispute_evidence', uri, job.id)]), job.id)} style={{ width: 84, height: 84, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera-outline" color={c.primary} />
              <Txt v="tiny" color={c.primary}>
                Take photo
              </Txt>
            </Pressable>
          </ScrollView>
        </Section>
      </Screen>
    );
  }

  const step = dispute.status === 'open' ? 0 : dispute.status === 'under_review' ? 1 : 2;
  return (
    <Screen title="Dispute" subtitle={job.title} right={<Pill label={dispute.status.replace('_', ' ')} tone={dispute.status === 'resolved' ? 'success' : 'danger'} />}>
      <Card>
        <Steps current={step} steps={['Dispute opened — escrow frozen', 'Sleek is reviewing chat & proof of work', 'Decision & payout']} />
      </Card>
      <Section title="Case">
        <Card>
          <KeyValue k="Opened by" v={dispute.openedBy === party ? 'You' : dispute.openedBy} />
          <KeyValue k="Reason" v={DISPUTE_REASONS.find((r) => r.id === dispute.reason)?.label ?? dispute.reason} />
          <KeyValue k="Opened" v={`${day(dispute.openedAt)} ${time(dispute.openedAt)}`} />
          <KeyValue k="Escrow" v={`${naira(job.escrow.amount)} ${dispute.status === 'resolved' ? '' : '(frozen)'}`} />
          <Txt style={{ marginTop: space.sm }}>{dispute.details}</Txt>
          {dispute.evidence.length ? (
            <ScrollView horizontal style={{ marginTop: space.sm }} contentContainerStyle={{ gap: 8 }}>
              {dispute.evidence.map((p) => (
                <Image key={p.id} source={{ uri: p.uri }} style={{ width: 80, height: 80, borderRadius: radius.sm }} />
              ))}
            </ScrollView>
          ) : null}
        </Card>
      </Section>
      {dispute.artisanResponse ? (
        <Section title="Artisan’s response">
          <Card>
            <Txt>{dispute.artisanResponse}</Txt>
          </Card>
        </Section>
      ) : party === 'artisan' && dispute.status !== 'resolved' ? (
        <Section title="Your side of the story">
          <Field multiline value={response} onChangeText={setResponse} placeholder="Explain what was done. Reviewers also see your proof of work." />
          <Button title="Send response" onPress={() => { const r = respondDispute(dispute.id, response); if (!r.ok) showMessage('Not sent', r.error); }} />
        </Section>
      ) : null}
      {dispute.resolution ? (
        <Section title="Decision">
          <Banner tone="success" title={{ release_to_artisan: 'Released to artisan', refund_customer: 'Refunded to customer', split: 'Split decision' }[dispute.resolution.outcome]} body={dispute.resolution.note} />
          <Card style={{ marginTop: space.sm }}>
            <KeyValue k="Artisan received" v={naira(job.escrow.releasedToArtisan ?? 0)} />
            <KeyValue k="Customer refunded" v={naira(job.escrow.refundedToCustomer ?? 0)} />
          </Card>
        </Section>
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Banner tone="info" body="Most disputes are resolved within 1–3 working days. Keep talking in the job chat — it’s part of the record." action="Open chat" onAction={() => router.push({ pathname: '/chat/[id]', params: { id: job.id } })} />
        </View>
      )}
    </Screen>
  );
}
