import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { showMessage } from '../../components/domain';
import { Banner, Button, Chip, Field, Row, Screen, Txt } from '../../components/ui';
import { moderateMessage } from '../../domain/moderation';
import type { TicketCategory } from '../../domain/types';
import { useStore } from '../../store';
import { space } from '../../theme';

const CATS: { value: TicketCategory; label: string }[] = [
  { value: 'payment', label: 'Payment or refund' },
  { value: 'job', label: 'A job' },
  { value: 'order', label: 'An order' },
  { value: 'verification', label: 'Verification' },
  { value: 'account', label: 'My account' },
  { value: 'safety', label: 'Safety' },
  { value: 'other', label: 'Something else' },
];

export default function NewTicket() {
  const p = useLocalSearchParams<{ jobId?: string; orderId?: string; category?: TicketCategory }>();
  const openTicket = useStore((s) => s.openTicket);
  const job = useStore((s) => s.jobs.find((j) => j.id === p.jobId));
  const [cat, setCat] = useState<TicketCategory>(p.category ?? (p.jobId ? 'job' : p.orderId ? 'order' : 'payment'));
  const [subject, setSubject] = useState(job ? `Help with “${job.title}”` : p.orderId ? `Order #${p.orderId.slice(-6).toUpperCase()}` : '');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const m = moderateMessage(`${subject} ${text}`);
    if (!m.allowed) return setError('No need to share phone numbers or emails. Support replies right here in the app.');
    const r = openTicket({ subject, category: cat, text, jobId: p.jobId, orderId: p.orderId });
    if (!r.ok) return setError(r.error);
    router.replace({ pathname: '/support/[id]', params: { id: r.value } });
    if (cat === 'safety') showMessage('Safety team alerted', 'If you are in danger right now, call 112.');
  };

  return (
    <Screen title="Contact support" footer={<Button title="Send" icon="send" onPress={send} />}>
      <Txt v="small" style={{ fontWeight: '600', marginBottom: 6 }}>
        What is it about?
      </Txt>
      <Row wrap gap={8} style={{ marginBottom: space.md }}>
        {CATS.map((x) => (
          <Chip key={x.value} label={x.label} selected={cat === x.value} onPress={() => setCat(x.value)} />
        ))}
      </Row>
      <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="e.g. I was charged twice" />
      <Field label="Tell us what happened" multiline value={text} onChangeText={setText} placeholder="The more detail, the faster we can help." error={error} />
      {p.jobId || p.orderId ? <Banner tone="info" icon="link-outline" body={`We’ll attach ${p.jobId ? 'the job, its chat and payment' : 'the order and its delivery'} details so you don’t have to explain twice.`} /> : null}
    </Screen>
  );
}
