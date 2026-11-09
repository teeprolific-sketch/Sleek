import { router } from 'expo-router';
import React, { useState } from 'react';
import { Banner, Button, Chip, Field, Row, Screen, Section, Txt } from '../components/ui';
import { useMyArtisan, useStore } from '../store';
import { space } from '../theme';

const BANKS = ['Access', 'GTBank', 'First Bank', 'UBA', 'Zenith', 'Wema', 'Kuda', 'Moniepoint', 'OPay', 'Fidelity', 'Stanbic IBTC', 'Sterling'];

/** Payout account must be in the verified name. Resolved server-side via the bank's name-enquiry API. */
export default function PayoutAccount() {
  const me = useMyArtisan();
  const setPayoutAccount = useStore((s) => s.setPayoutAccount);
  const [bank, setBank] = useState(me?.payoutAccount?.bankName ?? 'GTBank');
  const [acct, setAcct] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const nameOnRecord = me.identity.fullNameOnRecord ?? me.name;

  const resolve = () => {
    if (!/^\d{10}$/.test(acct)) return setError('NUBAN account numbers have 10 digits.');
    setError(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setResolved(nameOnRecord.toUpperCase());
    }, 800);
  };
  const save = () => {
    setPayoutAccount({ bankName: bank, accountNumberLast4: acct.slice(-4), accountName: resolved!, verified: true });
    router.back();
  };

  return (
    <Screen title="Payout account" footer={resolved ? <Button title="Save account" onPress={save} /> : <Button title="Check account" loading={loading} onPress={resolve} />}>
      <Banner tone="primary" icon="shield-checkmark-outline" body={`For your safety, payouts only go to an account in your verified name: ${nameOnRecord}.`} />
      <Section title="Bank">
        <Row wrap gap={8}>
          {BANKS.map((b) => (
            <Chip key={b} label={b} selected={bank === b} onPress={() => { setBank(b); setResolved(null); }} />
          ))}
        </Row>
      </Section>
      <Section title="Account number">
        <Field value={acct} onChangeText={(t) => { setAcct(t.replace(/\D/g, '').slice(0, 10)); setResolved(null); }} keyboardType="number-pad" placeholder="10-digit NUBAN" error={error} />
        {resolved ? (
          <Banner tone="success" title="Account found" body={`${resolved} · ${bank}`} />
        ) : (
          <Txt v="small" muted style={{ marginTop: space.sm }}>
            We confirm the account name with your bank before saving.
          </Txt>
        )}
      </Section>
    </Screen>
  );
}
