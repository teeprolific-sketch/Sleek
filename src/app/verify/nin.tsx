import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Banner, Button, Field, Screen, Spacer, Txt } from '../../components/ui';
import { isValidNIN } from '../../domain/verification';
import { useMyArtisan, useStore } from '../../store';

export default function NinStep() {
  const { workerId } = useLocalSearchParams<{ workerId?: string }>();
  const me = useMyArtisan();
  const verifyNIN = useStore((s) => s.verifyNIN);
  const worker = me?.workers.find((w) => w.id === workerId);
  const [nin, setNin] = useState('');
  const [name, setName] = useState(worker?.name ?? me?.name ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidNIN(nin)) return setError('Your NIN has 11 digits. Dial *346# to retrieve it.');
    setError(null);
    setLoading(true);
    const r = await verifyNIN(nin.replace(/\s/g, ''), name, workerId);
    setLoading(false);
    if (!r.ok) return setError(r.error);
    router.replace({ pathname: '/verify/liveness', params: workerId ? { workerId } : {} });
  };

  return (
    <Screen title="Verify NIN" subtitle={worker ? `For ${worker.name}` : undefined} footer={<Button title="Check NIN" loading={loading} onPress={submit} />}>
      <Txt v="h2">National Identification Number</Txt>
      <Txt muted style={{ marginTop: 6 }}>
        We check this with NIMC. The name must match the person who will do the work.
      </Txt>
      <Spacer h={24} />
      <Field label="Full name on NIN" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="NIN (11 digits)" value={nin} onChangeText={(t) => setNin(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder="•••••••••••" error={error} secureTextEntry />
      <Banner tone="primary" icon="lock-closed" body="We never store your full NIN on this phone — only the last 4 digits and the check result." />
    </Screen>
  );
}
