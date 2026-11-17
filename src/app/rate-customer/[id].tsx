import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Avatar, Banner, Button, Card, Field, Row, Screen, Stars, Txt } from '../../components/ui';
import { useJob, useStore } from '../../store';
import { space } from '../../theme';

const ITEMS = [
  { key: 'professionalism', label: 'Professionalism', hint: 'Respectful, ready on time, safe to work with' },
  { key: 'clarity', label: 'Clear job description', hint: 'The job matched what was described' },
  { key: 'payment', label: 'Payment behaviour', hint: 'Funded escrow promptly and approved fairly' },
] as const;

/** Two-way reviews: the artisan rates the customer. Improves matching for everyone. */
export default function RateCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const customer = useStore((s) => s.customers.find((c) => c.id === job?.customerId));
  const rate = useStore((s) => s.rateCustomer);
  const [scores, setScores] = useState({ professionalism: 0, clarity: 0, payment: 0 });
  const [comment, setComment] = useState('');
  if (!job || !customer) return <Screen title="Rate customer">{<Txt>Not found.</Txt>}</Screen>;
  if (job.customerReviewId) {
    return (
      <Screen title="Rate customer">
        <Banner tone="success" body="Thanks — your rating helps other artisans and improves matching." />
      </Screen>
    );
  }
  const ready = Object.values(scores).every((v) => v > 0);
  return (
    <Screen title="Rate your customer" footer={<Button title="Submit rating" disabled={!ready} onPress={() => { const r = rate(job.id, { ...scores, comment }); if (!r.ok) return showMessage('Not submitted', r.error); router.back(); }} />}>
      <View style={{ alignItems: 'center', paddingVertical: space.md }}>
        <Avatar name={customer.name} size={60} />
        <Txt v="h2" style={{ marginTop: space.sm }}>
          {customer.name}
        </Txt>
        <Txt muted>{job.title}</Txt>
      </View>
      {ITEMS.map((it) => (
        <Card key={it.key} style={{ marginBottom: space.sm }}>
          <Txt v="bodyStrong">{it.label}</Txt>
          <Txt v="small" muted style={{ marginBottom: 8 }}>
            {it.hint}
          </Txt>
          <Row>
            <Stars value={scores[it.key]} size={28} onChange={(v) => setScores({ ...scores, [it.key]: v })} />
          </Row>
        </Card>
      ))}
      <Field multiline label="Comment (optional, only Sleek and other artisans see a summary)" value={comment} onChangeText={setComment} />
      <Txt v="small" muted>
        Customers see their own average, not who rated them. Ratings can’t include contact details.
      </Txt>
    </Screen>
  );
}
