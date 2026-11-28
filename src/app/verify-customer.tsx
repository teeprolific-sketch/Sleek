import { router } from 'expo-router';
import React, { useState } from 'react';
import { Banner, Button, Field, Screen, Spacer, Steps, Txt } from '../components/ui';
import { useMyCustomer, useStore } from '../store';

/** Customers do a simple check: NIN with a matching name. Then they can book. */
export default function VerifyCustomer() {
  const me = useMyCustomer();
  const verifyCustomer = useStore((s) => s.verifyCustomer);
  const signOut = useStore((s) => s.signOut);
  const [nin, setNin] = useState('');
  const [name, setName] = useState(me?.name ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const done = me.identity?.nin === 'passed';
  const submit = async () => {
    setLoading(true);
    const r = await verifyCustomer(nin, name);
    setLoading(false);
    if (!r.ok) return setError(r.error);
    router.replace('/home');
  };
  return (
    <Screen title="Verify your account" back={false} footer={done ? <Button title="Start booking" onPress={() => router.replace('/home')} /> : <Button title="Check my NIN" loading={loading} onPress={submit} />}>
      <Steps current={done ? 2 : 1} steps={['Phone confirmed', 'NIN check', 'Ready to book']} />
      <Spacer />
      {done ? (
        <Banner tone="success" icon="checkmark-circle" title="You’re verified" body={`NIN ending ${me.identity?.ninLast4}. You can now book verified artisans.`} />
      ) : (
        <>
          <Txt muted>Every Sleek account is verified, so artisans know who they are working for. It takes about a minute.</Txt>
          <Spacer />
          <Field label="Full name on your NIN" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="NIN (11 digits)" value={nin} onChangeText={(t) => setNin(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" secureTextEntry placeholder="•••••••••••" error={error} hint="Dial *346# to get your NIN." />
          <Banner tone="primary" icon="lock-closed" body="We check it with NIMC through our licensed partner and keep only the last 4 digits. One NIN can only be used for one customer account." />
          <Button variant="ghost" title="Sign out" onPress={() => { signOut(); router.replace('/auth/sign-in'); }} />
        </>
      )}
    </Screen>
  );
}
