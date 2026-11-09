import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Avatar, Banner, Button, Chip, Field, Row, Screen, Spacer, Txt } from '../../components/ui';
import { canTip, TIP_MAX, TIP_MIN, TIP_PRESETS } from '../../domain/tips';
import type { PaymentMethod } from '../../services/payments';
import { useJob, useStore } from '../../store';
import { space } from '../../theme';
import { naira } from '../../utils/format';

export default function Tip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const addTip = useStore((s) => s.addTip);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [loading, setLoading] = useState(false);
  if (!job || !artisan) return <Screen title="Tip">{<Txt>Not found.</Txt>}</Screen>;
  const blocked = canTip(job);
  const value = custom ? Number(custom.replace(/\D/g, '')) : amount;

  const pay = async () => {
    setLoading(true);
    const r = await addTip(job.id, value, method);
    setLoading(false);
    if (!r.ok) return showMessage('Tip not sent', r.error);
    showMessage('Thank you!', `${naira(value)} has been sent to ${artisan.name.split(' ')[0]}.`);
    router.back();
  };

  return (
    <Screen title="Add a tip" footer={blocked ? undefined : <Button title={`Tip ${naira(value || 0)}`} icon="gift-outline" loading={loading} disabled={!value} onPress={pay} />}>
      <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
        <Avatar name={artisan.businessName ?? artisan.name} color={artisan.avatarColor} size={64} />
        <Txt v="h2" style={{ marginTop: space.md }}>
          Say thanks to {artisan.name.split(' ')[0]}
        </Txt>
        <Txt muted center>
          For “{job.title}”. Tips are optional and 100% go to the artisan — Sleek takes no commission.
        </Txt>
      </View>
      {blocked ? (
        <Banner tone="info" body={blocked} />
      ) : (
        <>
          <Row wrap gap={8}>
            {TIP_PRESETS.map((p) => (
              <Chip key={p} label={naira(p)} selected={!custom && amount === p} onPress={() => { setAmount(p); setCustom(''); }} />
            ))}
          </Row>
          <Spacer />
          <Field label="Or enter an amount" placeholder={`₦${TIP_MIN} – ₦${TIP_MAX.toLocaleString('en-NG')}`} keyboardType="number-pad" value={custom} onChangeText={setCustom} />
          <Txt v="small" style={{ fontWeight: '600', marginBottom: 6 }}>
            Pay with
          </Txt>
          <Row wrap gap={8}>
            <Chip label="Card" icon="card-outline" selected={method === 'card'} onPress={() => setMethod('card')} />
            <Chip label="Transfer" icon="swap-horizontal-outline" selected={method === 'transfer'} onPress={() => setMethod('transfer')} />
            <Chip label="USSD" icon="keypad-outline" selected={method === 'ussd'} onPress={() => setMethod('ussd')} />
          </Row>
        </>
      )}
    </Screen>
  );
}
