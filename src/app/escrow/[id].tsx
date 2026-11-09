import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Card, Divider, Icon, KeyValue, Row, Screen, Section, Steps, Txt } from '../../components/ui';
import { AUTO_RELEASE_HOURS, canFund } from '../../domain/escrow';
import { type PaymentMethod, virtualAccountFor } from '../../services/payments';
import { useJob, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { naira, windowLabel } from '../../utils/format';

const METHODS: { id: PaymentMethod; icon: string; title: string; body: string }[] = [
  { id: 'card', icon: 'card-outline', title: 'Debit card', body: 'Verve, Mastercard or Visa' },
  { id: 'transfer', icon: 'swap-horizontal-outline', title: 'Bank transfer', body: 'Pay into a one-time Sleek Escrow account' },
  { id: 'ussd', icon: 'keypad-outline', title: 'USSD', body: 'Works without data' },
];

export default function EscrowPayment() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const fundEscrow = useStore((s) => s.fundEscrow);
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [loading, setLoading] = useState(false);

  if (!job || !artisan) return <Screen title="Escrow">{<Txt>Not found.</Txt>}</Screen>;
  const amount = job.pricePool.locked?.amount ?? 0;
  const va = virtualAccountFor(job.id);

  const pay = async () => {
    setLoading(true);
    const r = await fundEscrow(job.id, method);
    setLoading(false);
    if (!r.ok) return showMessage('Payment not completed', r.error);
    router.replace({ pathname: '/job/[id]', params: { id: job.id } });
  };

  return (
    <Screen
      title="Pay into Sleek Escrow"
      footer={
        canFund(job) ? (
          <Button title={`Pay ${naira(amount)} into escrow`} icon="lock-closed" loading={loading} onPress={pay} />
        ) : job.escrow.state === 'held' || job.escrow.state === 'frozen' ? (
          <Banner tone="success" body="This job is already funded." />
        ) : (
          <Banner tone="warning" body="Agree and lock a price in the chat’s Price Pool first. Then you can pay into escrow." action="Open chat" onAction={() => router.replace({ pathname: '/chat/[id]', params: { id: job.id } })} />
        )
      }
    >
      <Card tone="soft">
        <Txt v="small" muted>
          Amount to hold in escrow
        </Txt>
        <Txt v="h1" style={{ fontSize: 34, marginTop: 4 }}>
          {naira(amount)}
        </Txt>
        <Txt v="small" muted>
          Locked price for “{job.title}” with {artisan.businessName ?? artisan.name}
        </Txt>
        <Divider />
        <KeyValue k="When" v={windowLabel(job.window)} />
        <KeyValue k="Sleek fee to you" v="₦0" />
        <KeyValue k="You pay" v={naira(amount)} strong />
      </Card>

      <Section title="How your money is protected">
        <Steps
          current={1}
          steps={[
            'Price agreed in chat',
            'You pay — Sleek holds the money, not the artisan',
            'Your address is shared and the artisan does the job',
            'You review the proof of work and approve',
            `Money is released. No reply in ${AUTO_RELEASE_HOURS[job.size]}h = auto-release`,
          ]}
        />
      </Section>

      <Section title="Payment method">
        {METHODS.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => setMethod(m.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: method === m.id }}
            style={{ borderWidth: method === m.id ? 2 : 1, borderColor: method === m.id ? c.primary : c.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, backgroundColor: c.card }}
          >
            <Row gap={space.md}>
              <Icon name={m.icon} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{m.title}</Txt>
                <Txt v="small" muted>
                  {m.body}
                </Txt>
              </View>
              <Icon name={method === m.id ? 'radio-button-on' : 'ellipse-outline'} color={method === m.id ? c.primary : c.textMuted} />
            </Row>
          </Pressable>
        ))}
        {method === 'transfer' ? (
          <Card tone="soft">
            <KeyValue k="Bank" v={va.bank} />
            <KeyValue k="Account number" v={va.accountNumber} strong />
            <KeyValue k="Account name" v={va.accountName} />
            <Txt v="small" muted style={{ marginTop: 6 }}>
              This account is unique to this job and expires in {va.expiresInMin} minutes. Never pay into an artisan’s personal account.
            </Txt>
          </Card>
        ) : null}
      </Section>
      <View style={{ marginTop: space.lg }}>
        <Banner tone="primary" icon="information-circle-outline" body="Cancel before work starts: full refund if 24h+ before the job, 90% if later. Once work starts, use a dispute instead." />
      </View>
    </Screen>
  );
}
