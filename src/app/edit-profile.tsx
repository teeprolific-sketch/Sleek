import { router } from 'expo-router';
import React, { useState } from 'react';
import { showMessage } from '../components/domain';
import { Banner, Button, Field, KeyValue, Screen, Section, Txt } from '../components/ui';
import { categoryName } from '../data/categories';
import { moderateMessage } from '../domain/moderation';
import { useMyArtisan, useStore } from '../store';
import { space } from '../theme';

export default function EditProfile() {
  const me = useMyArtisan();
  const update = useStore((s) => s.updateArtisanProfile);
  const [bio, setBio] = useState(me?.bio ?? '');
  const [area, setArea] = useState(me?.area ?? '');
  const [years, setYears] = useState(String(me?.yearsExperience ?? 1));
  const [prices, setPrices] = useState<Record<string, string>>(Object.fromEntries(Object.entries(me?.startingPrices ?? {}).map(([k, v]) => [k, String(v)])));
  if (!me) return null;
  const approved = me.skills.filter((s) => s.status === 'approved').map((s) => s.categoryId);

  const save = () => {
    const m = moderateMessage(bio);
    if (!m.allowed) return showMessage('Remove contact details', 'Your bio can’t include phone numbers, emails, links or social handles.');
    update({
      bio: bio.trim(),
      area: area.trim(),
      yearsExperience: Math.max(0, Number(years) || 0),
      startingPrices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, Number(v.replace(/\D/g, '')) || 0]).filter(([, v]) => (v as number) > 0)),
    });
    router.back();
  };

  return (
    <Screen title="Edit public profile" footer={<Button title="Save" onPress={save} />}>
      <Field label="About you" multiline value={bio} onChangeText={setBio} placeholder="What you do best, tools you bring, areas you cover." />
      <Field label="Area" value={area} onChangeText={setArea} />
      <Field label="Years of experience" value={years} onChangeText={setYears} keyboardType="number-pad" />
      <Section title="Starting prices (guide only)">
        <Txt v="small" muted style={{ marginBottom: space.sm }}>
          Shown on your profile. The real price is always agreed in the job’s Price Pool.
        </Txt>
        {approved.length ? (
          approved.map((cid) => <Field key={cid} label={categoryName(cid)} value={prices[cid] ?? ''} onChangeText={(t) => setPrices({ ...prices, [cid]: t })} keyboardType="number-pad" placeholder="₦" />)
        ) : (
          <KeyValue k="No verified skills yet" v="" />
        )}
      </Section>
      <Banner tone="info" body="Contact details in your profile are blocked, just like in chat." />
    </Screen>
  );
}
