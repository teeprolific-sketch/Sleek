import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Card, Chip, EmptyState, Field, Icon, Row, Screen, Section, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { suggestSlots } from '../../domain/availability';
import { moderateMessage } from '../../domain/moderation';
import { FEE_HELP, FEE_LABEL, feeFor } from '../../domain/fees';
import { naira } from '../../utils/format';
import type { CapturedMedia, TimeWindow } from '../../domain/types';
import { useMyCustomer, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { requestCapture } from '../../utils/captureBus';
import { day, time } from '../../utils/format';

const DURATIONS = [
  { min: 60, label: '1 hr' },
  { min: 120, label: '2 hrs' },
  { min: 240, label: 'Half day' },
  { min: 480, label: 'Full day' },
];

export default function Book() {
  const { c } = useTheme();
  const { id, categoryId, title: preTitle, description: preDesc, rebook } = useLocalSearchParams<{ id: string; categoryId: string; title?: string; description?: string; rebook?: string }>();
  const artisan = useStore((s) => s.artisans.find((a) => a.id === id));
  const jobs = useStore((s) => s.jobs);
  const createJob = useStore((s) => s.createJob);
  const logCapture = useStore((s) => s.logCapture);
  const me = useMyCustomer();
  const [title, setTitle] = useState(preTitle ?? '');
  const [desc, setDesc] = useState(preDesc ?? '');
  const [dayOffset, setDayOffset] = useState(0);
  const [duration, setDuration] = useState(120);
  const [slot, setSlot] = useState<TimeWindow | null>(null);
  const [addressIndex, setAddressIndex] = useState(0);
  const [photos, setPhotos] = useState<CapturedMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cat = category(categoryId);
  const tradeFeeTypes = useStore((s) => s.platformConfig?.tradeFeeTypes);
  const fee = feeFor(artisan ?? { fees: undefined }, categoryId, tradeFeeTypes);

  const slots = useMemo(() => {
    if (!artisan) return [];
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return suggestSlots(jobs, artisan, categoryId, d, duration, Date.now());
  }, [artisan, jobs, categoryId, dayOffset, duration]);

  if (!artisan || !me) return <Screen title="Book">{<Txt>Not found.</Txt>}</Screen>;

  const addPhoto = () =>
    requestCapture('issue_photo', (uri) => {
      const m = logCapture('issue_photo', uri);
      setPhotos((p) => [...p, m]);
    });

  const submit = () => {
    if (!slot) return setError('Pick a date and time for the job.');
    if (desc.trim().length < 10) return setError('Describe what you need in a sentence or two.');
    const mod = moderateMessage(`${title} ${desc}`);
    if (!mod.allowed) return setError(mod.warning!);
    const res = createJob({ artisanId: artisan.id, categoryId, title, description: desc, window: slot, addressIndex, issuePhotos: photos });
    if (!res.ok) return showMessage('Could not send request', res.error);
    router.replace({ pathname: '/fee/[id]', params: { id: res.value } });
  };

  return (
    <Screen title={`Request ${cat.name}`} subtitle={artisan.businessName ?? artisan.name} footer={<Button title={`Continue · ${FEE_LABEL[fee.type].toLowerCase()} ${naira(fee.amount)}`} icon="arrow-forward" onPress={submit} />}>
      <Banner tone="primary" icon="cash-outline" title={`${FEE_LABEL[fee.type]}: ${naira(fee.amount)}`} body={`${FEE_HELP[fee.type]} You pay it before ${artisan.businessName ?? artisan.name.split(' ')[0]} engages. It waits in Sleek Hold and comes back to you if they decline or don’t reply.`} />
      <View style={{ height: space.md }} />
      {rebook ? (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="success" icon="repeat-outline" title={`Booking ${artisan.businessName ?? artisan.name.split(' ')[0]} again`} body="We’ve copied the details from your last job. Change anything you need, then pick a time." />
        </View>
      ) : null}
      <Field label="Job title" placeholder={`e.g. ${cat.id === 'mechanic' ? 'Car brakes squeaking' : cat.name + ' needed'}`} value={title} onChangeText={setTitle} />
      <Field label="What do you need?" placeholder="Describe the job, size, and anything the artisan should know." value={desc} onChangeText={setDesc} multiline hint="Don’t include phone numbers or addresses — Sleek shares your address after you pay into Sleek Hold." />

      <Section title="Photo of the issue (optional)" style={{ marginTop: 4 }}>
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {photos.map((p) => (
            <Image key={p.id} source={{ uri: p.uri }} style={{ width: 84, height: 84, borderRadius: radius.md }} />
          ))}
          <Pressable onPress={addPhoto} accessibilityRole="button" accessibilityLabel="Take photo of the issue" style={{ width: 84, height: 84, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera-outline" color={c.primary} />
            <Txt v="tiny" color={c.primary}>
              Take photo
            </Txt>
          </Pressable>
        </ScrollView>
      </Section>

      <Section title="When?">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {Array.from({ length: 14 }, (_, o) => (
            <Chip key={o} label={day(new Date(Date.now() + o * 86_400_000))} selected={dayOffset === o} onPress={() => { setDayOffset(o); setSlot(null); }} />
          ))}
        </ScrollView>
        <Row wrap gap={8} style={{ marginTop: space.sm }}>
          {DURATIONS.map((d) => (
            <Chip key={d.min} label={d.label} icon="hourglass-outline" selected={duration === d.min} onPress={() => { setDuration(d.min); setSlot(null); }} />
          ))}
        </Row>
        <Txt v="small" muted style={{ marginTop: space.md, marginBottom: 6 }}>
          Free start times{cat.multiJobFriendly ? ' · this trade often takes several short jobs a day' : ''}
        </Txt>
        {slots.length ? (
          <Row wrap gap={8}>
            {slots.map((s) => (
              <Chip key={s.start} label={`${time(s.start)} – ${time(s.end)}`} selected={slot?.start === s.start} onPress={() => setSlot(s)} />
            ))}
          </Row>
        ) : (
          <EmptyState icon="calendar-outline" title="No free times this day" body="This artisan is booked or not working then. Try another day or a shorter duration." />
        )}
      </Section>

      <Section title="Where?">
        {me.addresses.map((a, i) => (
          <Card key={a.label} onPress={() => setAddressIndex(i)} style={{ marginBottom: space.sm, borderColor: addressIndex === i ? c.primary : c.border, borderWidth: addressIndex === i ? 2 : 1 }}>
            <Row gap={space.md}>
              <Icon name="location-outline" color={c.primary} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{a.label}</Txt>
                <Txt v="small" muted>
                  {a.line1}, {a.area}
                </Txt>
              </View>
              {addressIndex === i ? <Icon name="checkmark-circle" color={c.primary} /> : null}
            </Row>
          </Card>
        ))}
        <Banner tone="primary" icon="eye-off-outline" body={`The artisan only sees “${me.addresses[addressIndex]?.area ?? me.area}” until you pay into Sleek Hold. Then the full address is unlocked.`} />
      </Section>
      {error ? (
        <View style={{ marginTop: space.lg }}>
          <Banner tone="danger" body={error} />
        </View>
      ) : null}
    </Screen>
  );
}
