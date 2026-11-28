import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Avatar, Banner, Button, Card, Divider, Icon, KeyValue, Row, Screen, Steps, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { FEE_HELP, FEE_LABEL, FEE_RESPONSE_HOURS } from '../../domain/fees';
import type { PaymentMethod } from '../../services/payments';
import { useJob, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { naira, windowLabel } from '../../utils/format';

const METHODS: { id: PaymentMethod; icon: string; title: string; body: string }[] = [
  { id: 'card', icon: 'card-outline', title: 'Debit card', body: 'Verve, Mastercard or Visa' },
  { id: 'transfer', icon: 'swap-horizontal-outline', title: 'Bank transfer', body: 'Pay into a one-time Sleek Hold account' },
  { id: 'ussd', icon: 'keypad-outline', title: 'USSD', body: 'Works without data' },
];

/** Pay the upfront booking / consultancy / inspection fee before the artisan engages. */
export default function PayFee() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const payFee = useStore((s) => s.payFee);
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [loading, setLoading] = useState(false);
  if (!job || !artisan || !job.fee) return <Screen title="Upfront fee">{<Txt>Not found.</Txt>}</Screen>;
  const fee = job.fee;
  const label = FEE_LABEL[fee.type];
  const paid = fee.status !== 'unpaid';

  const pay = async () => {
    setLoading(true);
    const r = await payFee(job.id, method);
    setLoading(false);
    if (!r.ok) return showMessage('Payment didn’t go through', r.error);
    router.replace({ pathname: '/chat/[id]', params: { id: job.id } });
  };

  return (
    <Screen title={label} subtitle={`${category(job.categoryId).name} · ${artisan.businessName ?? artisan.name}`} footer={paid ? <Button title="Open chat" icon="chatbubbles-outline" onPress={() => router.replace({ pathname: '/chat/[id]', params: { id: job.id } })} /> : <Button title={`Pay ${naira(fee.amount)}`} icon="lock-closed" loading={loading} onPress={pay} />}>
      <Steps current={paid ? 2 : 1} steps={['Request sent', `Pay ${label.toLowerCase()}`, 'Chat & agree the price', 'Pay for the work into Sleek Hold']} />
      <Card style={{ marginTop: space.md }}>
        <Row gap={space.md}>
          <Avatar name={artisan.businessName ?? artisan.name} color={artisan.avatarColor} />
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong">{job.title}</Txt>
            <Txt v="small" muted>
              {windowLabel(job.window)}
            </Txt>
          </View>
        </Row>
        <Divider />
        <KeyValue k={label} v={naira(fee.amount)} strong />
        <Txt v="small" muted>
          {FEE_HELP[fee.type]} Set by {artisan.businessName ?? artisan.name.split(' ')[0]}.
        </Txt>
      </Card>
      {paid ? (
        <Banner tone="success" icon="checkmark-circle" title="Fee paid" body={`${naira(fee.amount)} is in Sleek Hold.`} />
      ) : (
        <>
          <Txt v="small" style={{ fontWeight: '600', marginTop: space.lg, marginBottom: 6 }}>
            Pay with
          </Txt>
          {METHODS.map((m) => {
            const on = method === m.id;
            return (
              <Pressable key={m.id} onPress={() => setMethod(m.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={{ borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.card, borderRadius: radius.md, padding: space.md, marginBottom: space.sm }}>
                <Row gap={space.md}>
                  <Icon name={m.icon} color={c.primary} />
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyStrong">{m.title}</Txt>
                    <Txt v="small" muted>
                      {m.body}
                    </Txt>
                  </View>
                  <Icon name={on ? 'radio-button-on' : 'ellipse-outline'} size={18} color={on ? c.primary : c.textMuted} />
                </Row>
              </Pressable>
            );
          })}
        </>
      )}
      <View style={{ marginTop: space.md }}>
        <Banner
          tone="primary"
          icon="shield-checkmark-outline"
          body={`The fee waits in Sleek Hold. ${fee.type === 'inspection' ? 'It goes to the artisan once they’ve inspected the problem.' : 'It goes to the artisan once they respond with a price.'} If they decline or don’t reply within ${FEE_RESPONSE_HOURS} hours, you get it back.`}
        />
      </View>
    </Screen>
  );
}
