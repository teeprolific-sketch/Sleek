import { router } from 'expo-router';
import React, { useState } from 'react';
import { Banner, Button, Field, Screen, Spacer, Steps, Txt } from '../../components/ui';
import { useStore } from '../../store';

export default function AddWorker() {
  const addWorker = useStore((s) => s.addWorker);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const r = addWorker(name);
    if (!r.ok) return setError(r.error);
    router.replace({ pathname: '/verify/nin', params: { workerId: r.value } });
  };
  return (
    <Screen title="Add a worker" footer={<Button title="Continue to verification" onPress={submit} />}>
      <Txt muted>The worker must be with you for the face check. They’ll need their NIN and to record their own skill videos.</Txt>
      <Spacer h={20} />
      <Field label="Worker’s full name (as on NIN)" value={name} onChangeText={setName} autoCapitalize="words" error={error} />
      <Steps current={0} steps={['Add worker', 'NIN check', 'Face liveness & match', 'Skill video per skill', 'Ready for assignment']} />
      <Spacer />
      <Banner tone="warning" icon="shield-checkmark-outline" body="Never add someone you haven’t met. Your account is responsible for every worker’s conduct, and rule breaks affect your team’s trust score." />
    </Screen>
  );
}
