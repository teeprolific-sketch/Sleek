import { router } from 'expo-router';
import React, { useState } from 'react';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, Chip, ListItem, Pill, Row, Screen, Section, Segmented, Txt } from '../components/ui';
import { DEFAULT_SCHEDULE, describeSchedule, MIN_PAYOUT } from '../domain/payouts';
import type { PayoutSchedule } from '../domain/types';
import { useMyArtisan, useStore } from '../store';
import { space } from '../theme';
import { naira } from '../utils/format';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MINIMUMS = [MIN_PAYOUT, 5000, 10000, 25000];

/** Bank/wallet account and payout schedule. */
export default function PayoutSettings() {
  const me = useMyArtisan();
  const save = useStore((s) => s.setPayoutSchedule);
  const [sched, setSched] = useState<PayoutSchedule>(me?.payoutSchedule ?? DEFAULT_SCHEDULE);
  if (!me) return null;

  return (
    <Screen
      title="Payout settings"
      footer={
        <Button
          title="Save settings"
          onPress={() => {
            if (sched.mode !== 'manual' && !me.payoutAccount?.verified) return showMessage('Add an account first', 'Automatic payouts need a verified bank or wallet account.');
            save(sched);
            router.back();
          }}
        />
      }
    >
      <Section title="Where your money goes" style={{ marginTop: 0 }}>
        <Card>
          {me.payoutAccount ? (
            <ListItem icon="card-outline" title={`${me.payoutAccount.bankName} ••${me.payoutAccount.accountNumberLast4}`} subtitle={me.payoutAccount.accountName} right={<Pill label={me.payoutAccount.verified ? 'Verified' : 'Pending'} tone={me.payoutAccount.verified ? 'success' : 'warning'} />} onPress={() => router.push('/payout-account')} />
          ) : (
            <ListItem icon="add-circle-outline" title="Add bank or wallet account" subtitle="Banks and wallets with a NUBAN (OPay, Moniepoint, Kuda, PalmPay)" onPress={() => router.push('/payout-account')} />
          )}
        </Card>
        <Txt v="small" muted style={{ marginTop: 6 }}>
          For your safety, payouts only go to an account in your verified name. Changing it takes effect for the next payout.
        </Txt>
      </Section>

      <Section title="Payout schedule">
        <Segmented<PayoutSchedule['mode']>
          value={sched.mode}
          onChange={(mode) => setSched({ ...sched, mode, weekday: mode === 'weekly' ? sched.weekday ?? 5 : undefined })}
          options={[
            { value: 'manual', label: 'Manual' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
          ]}
        />
        {sched.mode === 'weekly' ? (
          <Row wrap gap={8} style={{ marginTop: space.md }}>
            {DAYS.map((d, i) => (
              <Chip key={d} label={d} selected={sched.weekday === i} onPress={() => setSched({ ...sched, weekday: i })} />
            ))}
          </Row>
        ) : null}
        {sched.mode !== 'manual' ? (
          <>
            <Txt v="small" style={{ fontWeight: '600', marginTop: space.md, marginBottom: 6 }}>
              Only pay out when my balance is at least
            </Txt>
            <Row wrap gap={8}>
              {MINIMUMS.map((m) => (
                <Chip key={m} label={naira(m)} selected={sched.minimum === m} onPress={() => setSched({ ...sched, minimum: m })} />
              ))}
            </Row>
          </>
        ) : null}
        <Banner tone="info" body={describeSchedule(sched)} />
      </Section>
      <Txt v="small" muted style={{ marginTop: space.md }}>
        Payouts are free. Transfers usually arrive within minutes. If a transfer fails, the money returns to your Sleek balance automatically.
      </Txt>
    </Screen>
  );
}
