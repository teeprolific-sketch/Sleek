import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Card, Chip, Field, KeyValue, Row, Screen, Section, Txt } from '../../components/ui';
import { DISPUTE_REASONS } from '../../data/disputes';
import { commissionFor } from '../../domain/escrow';
import type { DisputeOutcome } from '../../domain/types';
import { useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { day, naira, time, windowLabel } from '../../utils/format';

/** Admin: resolve a dispute using the full chat history and proof of work. */
export default function ResolveDispute() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const dispute = useStore((s) => s.disputes.find((d) => d.id === id));
  const job = useStore((s) => s.jobs.find((j) => j.id === dispute?.jobId));
  const allMessages = useStore((s) => s.messages);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const customer = useStore((s) => s.customers.find((x) => x.id === job?.customerId));
  const resolve = useStore((s) => s.resolveDispute);
  const startReview = useStore((s) => s.startDisputeReview);
  const [outcome, setOutcome] = useState<DisputeOutcome>('split');
  const [share, setShare] = useState(0.5);
  const [note, setNote] = useState('');
  const messages = useMemo(() => allMessages.filter((m) => m.jobId === job?.id), [allMessages, job?.id]);

  useEffect(() => {
    if (dispute?.status === 'open') startReview(dispute.id);
  }, [dispute?.id, dispute?.status, startReview]);

  if (!dispute || !job || !artisan || !customer) return <Screen title="Dispute">{<Txt>Not found.</Txt>}</Screen>;
  const amount = job.escrow.amount;
  const effShare = outcome === 'release_to_artisan' ? 1 : outcome === 'refund_customer' ? 0 : share;
  const artisanGross = Math.round(amount * effShare);
  const submit = () => {
    const r = resolve(dispute.id, outcome, share, note);
    if (!r.ok) return showMessage('Not resolved', r.error);
    router.back();
  };

  return (
    <Screen title="Resolve dispute" subtitle={job.title} footer={dispute.status !== 'resolved' ? <Button title="Issue decision" icon="hammer-outline" onPress={submit} /> : undefined}>
      <Card>
        <KeyValue k="Customer" v={customer.name} />
        <KeyValue k="Artisan" v={artisan.businessName ?? artisan.name} />
        <KeyValue k="Reason" v={DISPUTE_REASONS.find((r) => r.id === dispute.reason)?.label ?? ''} />
        <KeyValue k="Locked price / escrow" v={naira(amount)} strong />
        <KeyValue k="Window" v={windowLabel(job.window)} />
        <Txt style={{ marginTop: space.sm }}>{dispute.details}</Txt>
        {dispute.artisanResponse ? (
          <Banner tone="info" title="Artisan response" body={dispute.artisanResponse} />
        ) : (
          <Txt v="small" muted style={{ marginTop: 6 }}>
            Artisan hasn’t responded yet.
          </Txt>
        )}
      </Card>

      <Section title="Evidence">
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {[...job.issuePhotos, ...(job.proof?.photos ?? []), ...dispute.evidence].map((p) => (
            <View key={p.id}>
              <Image source={{ uri: p.uri }} style={{ width: 110, height: 110, borderRadius: radius.md }} />
              <Txt v="tiny" muted>
                {p.purpose.replace('_', ' ')}
              </Txt>
            </View>
          ))}
        </ScrollView>
        {job.proof?.note ? <Txt v="small" muted style={{ marginTop: 6 }}>Proof note: {job.proof.note}</Txt> : null}
      </Section>

      <Section title={`Chat history (${messages.length})`}>
        <Card tone="soft">
          {messages.map((m) => (
            <Txt key={m.id} v="small" style={{ marginBottom: 4 }}>
              <Txt v="small" color={m.from === 'customer' ? c.primary : m.from === 'artisan' ? c.success : c.textMuted}>
                [{day(m.at)} {time(m.at)}] {m.from}:
              </Txt>{' '}
              {m.text}
            </Txt>
          ))}
        </Card>
      </Section>

      {dispute.status === 'resolved' && dispute.resolution ? (
        <Section title="Decision">
          <Banner tone="success" body={dispute.resolution.note} />
        </Section>
      ) : (
        <Section title="Decision">
          <Row wrap gap={8}>
            <Chip label="Release to artisan" selected={outcome === 'release_to_artisan'} onPress={() => setOutcome('release_to_artisan')} />
            <Chip label="Refund customer" selected={outcome === 'refund_customer'} onPress={() => setOutcome('refund_customer')} />
            <Chip label="Split" selected={outcome === 'split'} onPress={() => setOutcome('split')} />
          </Row>
          {outcome === 'split' ? (
            <Row wrap gap={8} style={{ marginTop: space.sm }}>
              {[0.25, 0.5, 0.75].map((x) => (
                <Chip key={x} label={`${x * 100}% to artisan`} selected={share === x} onPress={() => setShare(x)} />
              ))}
            </Row>
          ) : null}
          <Card style={{ marginTop: space.md }}>
            <KeyValue k="Artisan receives" v={`${naira(commissionFor(artisanGross, false).payout)} (after commission)`} />
            <KeyValue k="Customer refunded" v={naira(amount - artisanGross)} />
          </Card>
          <Field multiline label="Explanation for both parties" value={note} onChangeText={setNote} placeholder="What the evidence showed and why." style={{ marginTop: space.md }} />
        </Section>
      )}
    </Screen>
  );
}
