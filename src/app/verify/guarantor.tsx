import { router } from 'expo-router';
import React, { useState } from 'react';
import { Banner, Button, Field, Screen, Spacer, Txt } from '../../components/ui';
import { useStore } from '../../store';

/** A guarantor vouches for the artisan or seller. They confirm by reading back the code we text them. */
export default function GuarantorStep() {
  const setGuarantor = useStore((s) => s.setGuarantor);
  const confirmGuarantor = useStore((s) => s.confirmGuarantor);
  const existing = useStore((s) => (s.artisans.find((a) => a.id === s.session.userId) ?? s.sellers.find((x) => x.id === s.session.userId))?.guarantor);
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [relationship, setRelationship] = useState(existing?.relationship ?? '');
  const [occupation, setOccupation] = useState(existing?.occupation ?? '');
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <Screen title="Guarantor confirmation" footer={<Button title="Confirm guarantor" onPress={() => { const r = confirmGuarantor(code); if (!r.ok) return setError(r.error); router.replace('/verify'); }} />}>
        <Txt>We texted {name.split(' ')[0]} a code and a short note explaining that you named them as your guarantor on Sleek. Ask them for the code.</Txt>
        <Spacer />
        <Banner tone="info" icon="chatbox-ellipses-outline" title="Simulated SMS to your guarantor (Termii)" body={`Sleek: ${name.split(' ')[0]}, you were named as a guarantor. If you agree, share this code: ${sent}. If you don’t know this person, ignore this message.`} />
        <Field label="Code from your guarantor" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="••••••" error={error} />
        <Button variant="ghost" title="Change guarantor" onPress={() => setSent(null)} />
      </Screen>
    );
  }
  return (
    <Screen title="Your guarantor" subtitle="Someone who knows you and vouches for you" footer={<Button title="Send code to guarantor" onPress={() => { const r = setGuarantor({ name, phone, relationship, occupation }); if (!r.ok) return setError(r.error); setError(null); setSent(r.value); }} />}>
      <Banner tone="primary" icon="people-outline" body="Choose an adult who has known you for at least a year, such as an employer, a trade association head, a religious leader or a senior family member. They can’t be you, and they can only guarantee one Sleek account." />
      <Spacer />
      <Field label="Guarantor’s full name" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Guarantor’s phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0803 123 4567" />
      <Field label="How do you know them?" value={relationship} onChangeText={setRelationship} placeholder="e.g. My former employer" />
      <Field label="Their occupation" value={occupation} onChangeText={setOccupation} placeholder="e.g. Head of Ladipo Mechanics Association" error={error} />
    </Screen>
  );
}
