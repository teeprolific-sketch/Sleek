import React, { useState } from 'react';
import { View } from 'react-native';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, Chip, Field, Row, Screen, Section, Txt } from '../components/ui';
import { category, defaultFeeType } from '../data/categories';
import { FEE_HELP, FEE_LABEL, feeFor, MAX_FEE, MIN_FEE } from '../domain/fees';
import type { FeeType } from '../domain/types';
import { useMyArtisan, useStore } from '../store';
import { space } from '../theme';
import { naira } from '../utils/format';

const TYPES: FeeType[] = ['booking', 'consultancy', 'inspection'];

/** Artisans choose the upfront fee for each verified trade: type and amount. */
export default function Fees() {
  const me = useMyArtisan();
  const tradeFeeTypes = useStore((s) => s.platformConfig?.tradeFeeTypes);
  const rate = useStore((s) => s.platformConfig?.commissionRate ?? 0.2);
  if (!me) return null;
  const trades = [...new Set([...me.skills, ...me.workers.flatMap((w) => w.skills)].filter((k) => k.status === 'approved').map((k) => k.categoryId))];
  return (
    <Screen title="Your upfront fees" subtitle="Paid by the customer before you engage">
      <Banner tone="primary" icon="information-circle-outline" body={`Every request starts with one fee: booking, consultancy or inspection. Choose the one that fits each trade and set the amount (₦${MIN_FEE.toLocaleString('en-NG')}–₦${MAX_FEE.toLocaleString('en-NG')}). Sleek keeps ${Math.round(rate * 100)}%. You can also change it for a single job in the chat before the customer pays.`} />
      <Section title="Your trades">
        {trades.length ? trades.map((id) => <TradeFee key={id} categoryId={id} current={feeFor(me, id, tradeFeeTypes)} custom={!!me.fees?.[id]} sleekDefault={tradeFeeTypes?.[id] ?? defaultFeeType(id)} rate={rate} />) : <Txt muted>Verify a skill first. Each verified trade gets its own fee.</Txt>}
      </Section>
    </Screen>
  );
}

function TradeFee({ categoryId, current, custom, sleekDefault, rate }: { categoryId: string; current: { type: FeeType; amount: number }; custom: boolean; sleekDefault: FeeType; rate: number }) {
  const setArtisanFee = useStore((s) => s.setArtisanFee);
  const [type, setType] = useState<FeeType>(current.type);
  const [amount, setAmount] = useState(String(current.amount));
  const n = Number(amount.replace(/\D/g, ''));
  const save = () => {
    const r = setArtisanFee(categoryId, { type, amount: n });
    showMessage(r.ok ? 'Saved' : 'Not saved', r.ok ? `${category(categoryId).name}: ${FEE_LABEL[type].toLowerCase()} of ${naira(n)}.` : r.error);
  };
  return (
    <Card style={{ marginBottom: space.sm }}>
      <Txt v="bodyStrong">{category(categoryId).name}</Txt>
      <Txt v="tiny" muted>
        Sleek suggests: {FEE_LABEL[sleekDefault].toLowerCase()}
        {custom ? ' · you set your own' : ''}
      </Txt>
      <Row wrap gap={8} style={{ marginTop: space.sm }}>
        {TYPES.map((t) => (
          <Chip key={t} label={FEE_LABEL[t]} selected={type === t} onPress={() => setType(t)} />
        ))}
      </Row>
      <Txt v="small" muted style={{ marginTop: 6 }}>
        {FEE_HELP[type]}
      </Txt>
      <View style={{ marginTop: space.sm }}>
        <Field label="Amount (₦)" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" hint={n ? `You receive ${naira(Math.round(n * (1 - rate)))} after Sleek’s ${Math.round(rate * 100)}%.` : undefined} />
      </View>
      <Button small title="Save" onPress={save} />
    </Card>
  );
}
