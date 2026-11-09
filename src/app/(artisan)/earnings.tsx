import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Card, Field, Icon, KeyValue, ListItem, Pill, Row, Screen, Section, Stat, Txt } from '../../components/ui';
import { COMMISSION_RATE, TRUSTED_COMMISSION_RATE } from '../../domain/escrow';
import { isTrusted } from '../../domain/trust';
import { balanceOf, useMyArtisan, useStore } from '../../store';
import { space, useTheme } from '../../theme';
import { day, naira } from '../../utils/format';

export default function Earnings() {
  const { c } = useTheme();
  const me = useMyArtisan();
  const ledgerAll = useStore((s) => s.ledger);
  const payoutsAll = useStore((s) => s.payouts);
  const jobs = useStore((s) => s.jobs);
  const requestPayout = useStore((s) => s.requestPayout);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const ledger = useMemo(() => ledgerAll.filter((l) => l.artisanId === me?.id), [ledgerAll, me?.id]);
  const payouts = useMemo(() => payoutsAll.filter((p) => p.artisanId === me?.id), [payoutsAll, me?.id]);
  if (!me) return null;
  const balance = balanceOf(ledgerAll, me.id);
  const held = jobs.filter((j) => j.artisanId === me.id && (j.escrow.state === 'held' || j.escrow.state === 'frozen')).reduce((s, j) => s + j.escrow.amount, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  const thisMonth = ledger.filter((l) => l.amount > 0 && new Date(l.at) >= monthStart).reduce((s, l) => s + l.amount, 0);
  const trusted = isTrusted(me, Date.now());

  const withdraw = async () => {
    const n = Number(amount.replace(/\D/g, '')) || balance;
    setLoading(true);
    const r = await requestPayout(n);
    setLoading(false);
    if (!r.ok) return showMessage('Payout not sent', r.error);
    setAmount('');
  };

  return (
    <Screen title="Earnings & payouts" back={false}>
      <Card style={{ backgroundColor: '#0B3D91', borderColor: '#0B3D91' }}>
        <Txt v="small" color="#BFE6FB">
          Available to withdraw
        </Txt>
        <Txt v="h1" color="#fff" style={{ fontSize: 34 }}>
          {naira(balance)}
        </Txt>
        <Txt v="small" color="#BFE6FB">
          Paid to {me.payoutAccount ? `${me.payoutAccount.bankName} ••${me.payoutAccount.accountNumberLast4}` : 'no bank account yet'}
        </Txt>
      </Card>
      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        <Stat label="Held in escrow" value={naira(held)} icon="lock-closed-outline" />
        <Stat label="Earned this month" value={naira(thisMonth)} icon="trending-up-outline" />
      </Row>

      <Section title="Withdraw">
        {me.payoutAccount?.verified ? (
          <>
            <Field placeholder={`Amount (max ${naira(balance)})`} keyboardType="number-pad" value={amount} onChangeText={setAmount} hint="Leave empty to withdraw everything." />
            <Button title="Withdraw to bank" icon="arrow-down-circle-outline" loading={loading} disabled={balance < 1000} onPress={withdraw} />
          </>
        ) : (
          <Banner tone="warning" body="Add a bank account in your name to receive payouts." action="Add payout account" onAction={() => router.push('/payout-account')} />
        )}
      </Section>

      <Section title="How you get paid">
        <Card tone="soft">
          <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <Icon name="shield-checkmark-outline" color={c.primary} />
            <Txt v="small" style={{ flex: 1 }}>
              Customers pay into Sleek Escrow before you start. When they approve your proof of work — or don’t respond within 24/48/72 hours — the money is released to you minus {Math.round((trusted ? TRUSTED_COMMISSION_RATE : COMMISSION_RATE) * 100)}% commission{trusted ? ' (Trusted rate)' : ''}.
            </Txt>
          </Row>
        </Card>
      </Section>

      <Section title="History">
        {ledger.length ? (
          ledger.map((l) => (
            <ListItem
              key={l.id}
              icon={l.amount > 0 ? 'arrow-down-outline' : 'arrow-up-outline'}
              title={l.note}
              subtitle={`${day(l.at)} · ${l.type.replace('_', ' ')}`}
              right={
                <Txt v="bodyStrong" color={l.amount > 0 ? c.success : c.text}>
                  {l.amount > 0 ? '+' : ''}
                  {naira(l.amount)}
                </Txt>
              }
            />
          ))
        ) : (
          <Txt muted>No earnings yet. Your first released escrow payment will show here.</Txt>
        )}
      </Section>
      {payouts.length ? (
        <Section title="Payouts">
          {payouts.map((p) => (
            <Row key={p.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <View>
                <Txt>{naira(p.amount)}</Txt>
                <Txt v="small" muted>
                  {day(p.requestedAt)}
                </Txt>
              </View>
              <Pill label={p.status} tone={p.status === 'paid' ? 'success' : p.status === 'failed' ? 'danger' : 'warning'} />
            </Row>
          ))}
        </Section>
      ) : null}
      <View style={{ marginTop: space.lg }}>
        <KeyValue k="Payout account" v={me.payoutAccount ? `${me.payoutAccount.accountName}` : 'Not set'} />
        <Button small variant="ghost" title="Manage payout account" onPress={() => router.push('/payout-account')} />
      </View>
    </Screen>
  );
}
