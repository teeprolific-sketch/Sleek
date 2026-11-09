import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, ScrollView, View } from 'react-native';
import { confirmAction, showMessage } from '../../components/domain';
import { Banner, Button, Card, EmptyState, KeyValue, Screen, Section, Txt } from '../../components/ui';
import { commissionFor } from '../../domain/escrow';
import { useJob, useStore } from '../../store';
import { radius, space } from '../../theme';
import { countdown, day, naira, time } from '../../utils/format';

/** Customer reviews proof of work and approves (release) or disputes. */
export default function ProofReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const approveJob = useStore((s) => s.approveJob);
  if (!job || !artisan) return <Screen title="Proof of work">{<Txt>Not found.</Txt>}</Screen>;
  const proof = job.proof;
  const amount = job.escrow.amount;

  const approve = () =>
    confirmAction('Approve and release payment?', `${naira(amount)} will be released to ${artisan.businessName ?? artisan.name}. This can’t be undone.`, 'Approve & release', () => {
      const r = approveJob(job.id);
      if (!r.ok) return showMessage('Not possible', r.error);
      router.replace({ pathname: '/review/[id]', params: { id: job.id } });
    });

  return (
    <Screen
      title="Review the work"
      subtitle={job.title}
      footer={
        job.status === 'proof_submitted' ? (
          <>
            <Button title={`Approve & release ${naira(amount)}`} icon="checkmark-circle" onPress={approve} />
            <Button variant="ghost" title="Something’s wrong — open a dispute" icon="flag-outline" onPress={() => router.push({ pathname: '/dispute/[id]', params: { id: job.id } })} />
          </>
        ) : undefined
      }
    >
      {!proof ? (
        <EmptyState icon="images-outline" title="No proof yet" body="The artisan hasn’t uploaded proof of work yet. You’ll be notified when they do." />
      ) : (
        <>
          {job.status === 'proof_submitted' ? (
            <Banner tone="warning" icon="hourglass-outline" body={`Please respond within ${countdown(proof.autoReleaseAt)}. If you don’t, payment is released automatically.`} />
          ) : null}
          <Section title={`Photos (${proof.photos.length})`}>
            <ScrollView horizontal contentContainerStyle={{ gap: space.sm }}>
              {proof.photos.map((p) => (
                <Image key={p.id} source={{ uri: p.uri }} style={{ width: 240, height: 240, borderRadius: radius.lg }} />
              ))}
            </ScrollView>
            <Txt v="small" muted style={{ marginTop: 6 }}>
              Captured live in the app on {day(proof.submittedAt)} at {time(proof.submittedAt)}.
            </Txt>
          </Section>
          {proof.note ? (
            <Section title="Artisan’s summary">
              <Card>
                <Txt>{proof.note}</Txt>
              </Card>
            </Section>
          ) : null}
          <Section title="Payment">
            <Card>
              <KeyValue k="Held in escrow" v={naira(amount)} />
              <KeyValue k="Artisan receives" v={naira(commissionFor(amount, false).payout) + '+'} />
              <Txt v="small" muted style={{ marginTop: 6 }}>
                Sleek’s commission comes out of the artisan’s side. You pay nothing extra.
              </Txt>
            </Card>
          </Section>
          <View style={{ height: space.lg }} />
        </>
      )}
    </Screen>
  );
}
