import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Field, Icon, Screen, Section, Txt } from '../../components/ui';
import { AUTO_RELEASE_HOURS } from '../../domain/escrow';
import type { CapturedMedia } from '../../domain/types';
import { useJob, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { requestCapture } from '../../utils/captureBus';

export default function ProofUpload() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const submitProof = useStore((s) => s.submitProof);
  const logCapture = useStore((s) => s.logCapture);
  const [photos, setPhotos] = useState<CapturedMedia[]>([]);
  const [note, setNote] = useState('');
  if (!job) return <Screen title="Proof of work">{<Txt>Not found.</Txt>}</Screen>;

  const add = () => requestCapture('proof_of_work', (uri) => setPhotos((p) => [...p, logCapture('proof_of_work', uri, job.id)]), job.id);
  const submit = () => {
    const r = submitProof(job.id, photos, note);
    if (!r.ok) return showMessage('Can’t submit yet', r.error);
    router.replace({ pathname: '/job/[id]', params: { id: job.id } });
  };

  return (
    <Screen title="Upload proof of work" subtitle={job.title} footer={<Button title="Submit for approval" icon="cloud-upload-outline" disabled={!photos.length} onPress={submit} />}>
      <Banner tone="primary" icon="information-circle-outline" body={`Show the finished work clearly. The customer then has ${AUTO_RELEASE_HOURS[job.size]} hours to approve or raise a dispute. If they don’t respond, your payment is released automatically.`} />
      <Section title={`Photos (${photos.length})`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {photos.map((p) => (
            <Pressable key={p.id} onLongPress={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}>
              <Image source={{ uri: p.uri }} style={{ width: 100, height: 100, borderRadius: radius.md }} />
            </Pressable>
          ))}
          <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="Take proof photo" style={{ width: 100, height: 100, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera-outline" color={c.primary} />
            <Txt v="tiny" color={c.primary}>
              Take photo
            </Txt>
          </Pressable>
        </View>
        <Txt v="small" muted style={{ marginTop: 6 }}>
          Photos are taken live in the app and logged. Long-press to remove one.
        </Txt>
      </Section>
      <Section title="Work summary">
        <Field multiline placeholder="What did you do? Any parts replaced? Advice for the customer?" value={note} onChangeText={setNote} />
      </Section>
    </Screen>
  );
}
