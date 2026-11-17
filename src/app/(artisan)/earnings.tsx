import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Card, Chip, Field, Icon, ListItem, Pill, Row, Screen, Section, Stat, Txt } from '../../components/ui';
import { COMMISSION_RATE, TRUSTED_COMMISSION_RATE } from '../../domain/escrow';
import { describeSchedule } from '../../domain/payouts';
import { isTrusted } from '../../domain/trust';
import type { LedgerEntry } from '../../domain/types';
import { balanceOf, useMyArtisan, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { day, naira } from '../../utils/format';

type Filter = 'all' | 'in' | 'out';
const TYPE_LABEL: Record<LedgerEntry['type'], string> = {
  escrow_release: 'Job payment',
  tip: 'Tip',
  referral_bonus: 'Referral bonus',
  cancellation_fee: 'Late-cancellation fee',
  payout: 'Payout',
  payout_reversal: 'Payout returned',
};

/** Earnings & payout dashboard. */
export default function Earnings() {
  const { c } = useTheme();
  const me = useMyArtisan();
  const ledgerAll = useStore((s) => s.ledger);
  const payoutsAll = useStore((s) => s.payouts);
  const jobs = useStore((s) => s.jobs);
  const requestPayout = useStore((s) => s.requestPayout);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const ledger = useMemo(() => ledgerAll.filter((l) => l.artisanId === me?.id), [ledgerAll, me?.id]);
  const payouts = useMemo(() => payoutsAll.filter((p) => p.artisanId === me?.id), [payoutsAll, me?.id]);
  if (!me) return null;

  const balance = balanceOf(ledgerAll, me.id);
  const mine = jobs.filter((j) => j.artisanId === me.id);
  const held = mine.filter((j) => j.escrow.state === 'held' || j.escrow.state === 'frozen');
  const pending = held.reduce((s, j) => s + j.escrow.amount, 0);
  const awaitingApproval = mine.filter((j) => j.status === 'proof_submitted').reduce((s, j) => s + j.escrow.amount, 0);
  const totalEarned = ledger.filter((l) => l.amount > 0 && l.type !== 'payout_reversal').reduce((s, l) => s + l.amount, 0);
  const commission = mine.reduce((s, j) => s + (j.escrow.commission ?? 0), 0);
  const tips = ledger.filter((l) => l.type === 'tip').reduce((s, l) => s + l.amount, 0);
  const referral = ledger.filter((l) => l.type === 'referral_bonus').reduce((s, l) => s + l.amount, 0);
  const paidOut = payouts.filter((p) => p.status !== 'failed').reduce((s, p) => s + p.amount, 0);
  const trusted = isTrusted(me, Date.now());
  const rate = trusted ? TRUSTED_COMMISSION_RATE : COMMISSION_RATE;
  const shown = ledger.filter((l) => (filter === 'all' ? true : filter === 'in' ? l.amount > 0 : l.amount < 0));

  const withdraw = async () => {
    const n = Number(amount.replace(/\D/g, '')) || balance;
    setLoading(true);
    const r = await requestPayout(n);
    setLoading(false);
    if (!r.ok) return showMessage('Payout not sent', r.error);
    setAmount('');
  };

  return (
    <Screen title="Earnings & payouts" back={false} right={<Pressable onPress={() => router.push('/payout-settings')} hitSlop={8} accessibilityLabel="Payout settings"><Icon name="settings-outline" /></Pressable>}>
      <Card style={{ backgroundColor: c.heroBg, borderColor: c.heroBg }}>
        <Txt v="small" color={c.heroMuted}>
          Available to withdraw
        </Txt>
        <Txt v="h1" color={c.heroText} style={{ fontSize: 34 }}>
          {naira(balance)}
        </Txt>
        <Txt v="small" color={c.heroMuted}>
          {me.payoutAccount ? `${me.payoutAccount.bankName} ••${me.payoutAccount.accountNumberLast4}` : 'No payout account yet'} · {describeSchedule(me.payoutSchedule)}
        </Txt>
      </Card>

      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        <Stat label="Pending in escrow" value={naira(pending)} icon="lock-closed-outline" />
        <Stat label="Total earned" value={naira(totalEarned)} icon="trending-up-outline" />
      </Row>
      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        <Stat label="Commission paid" value={naira(commission)} icon="pie-chart-outline" />
        <Stat label="Tips received" value={naira(tips)} icon="gift-outline" />
        <Stat label="Paid out" value={naira(paidOut)} icon="arrow-down-circle-outline" />
      </Row>

      <Section title="Pending breakdown">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt>Waiting for customer approval</Txt>
            <Txt v="bodyStrong">{naira(awaitingApproval)}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Txt>Booked, work not finished</Txt>
            <Txt v="bodyStrong">{naira(pending - awaitingApproval)}</Txt>
          </Row>
          <Txt v="small" muted style={{ marginTop: space.sm }}>
            You receive {Math.round((1 - rate) * 100)}% of each job when it’s released (Sleek commission {Math.round(rate * 100)}%{trusted ? ' — Trusted rate' : '; drops to 8% when you become Trusted'}). Tips{referral ? ' and referral bonuses' : ''} are 100% yours.
          </Txt>
        </Card>
      </Section>

      <Section title="Withdraw">
        {me.payoutAccount?.verified ? (
          <>
            <Field placeholder={`Amount (max ${naira(balance)})`} keyboardType="number-pad" value={amount} onChangeText={setAmount} hint="Leave empty to withdraw everything." />
            <Button title="Withdraw to bank" icon="arrow-down-circle-outline" loading={loading} disabled={balance < 1000} onPress={withdraw} />
          </>
        ) : (
          <Banner tone="warning" body="Add a bank account in your name to receive payouts." action="Add payout account" onAction={() => router.push('/payout-account')} />
        )}
        <ListItem icon="calendar-outline" title="Payout settings" subtitle={describeSchedule(me.payoutSchedule)} onPress={() => router.push('/payout-settings')} />
      </Section>

      <Section title="Transactions">
        <Row gap={8} style={{ marginBottom: space.sm }}>
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Money in" selected={filter === 'in'} onPress={() => setFilter('in')} />
          <Chip label="Payouts" selected={filter === 'out'} onPress={() => setFilter('out')} />
        </Row>
        {shown.length ? (
          shown.map((l) => (
            <ListItem
              key={l.id}
              icon={l.amount > 0 ? (l.type === 'tip' ? 'gift-outline' : 'arrow-down-outline') : 'arrow-up-outline'}
              title={l.note}
              subtitle={`${day(l.at)} · ${TYPE_LABEL[l.type]}`}
              onPress={l.jobId ? () => router.push({ pathname: '/job/[id]', params: { id: l.jobId! } }) : undefined}
              right={
                <Txt v="bodyStrong" color={l.amount > 0 ? c.success : c.text}>
                  {l.amount > 0 ? '+' : ''}
                  {naira(l.amount)}
                </Txt>
              }
            />
          ))
        ) : (
          <Txt muted>Nothing here yet. Your first released escrow payment will show up here.</Txt>
        )}
      </Section>

      {payouts.length ? (
        <Section title="Payout history">
          {payouts.map((p) => (
            <Row key={p.id} style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
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
      <View style={{ height: space.lg, borderRadius: radius.md }} />
    </Screen>
  );
}
