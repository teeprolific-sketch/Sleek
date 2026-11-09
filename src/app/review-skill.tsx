import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { AdminNotes } from '../components/AdminNotes';
import { showMessage } from '../components/domain';
import { Avatar, Banner, Button, Card, Chip, Field, Icon, KeyValue, Row, Screen, Section, Stars, Txt } from '../components/ui';
import { category } from '../data/categories';
import { SKILL_VIDEO_FACE_THRESHOLD } from '../domain/verification';
import { useStore } from '../store';
import { radius, space, useTheme } from '../theme';
import { day, time } from '../utils/format';

/** Admin: review one skill video and approve / reject / ask for more. */
export default function ReviewSkill() {
  const { c } = useTheme();
  const { artisanId, workerId, categoryId } = useLocalSearchParams<{ artisanId: string; workerId?: string; categoryId: string }>();
  const artisan = useStore((s) => s.artisans.find((a) => a.id === artisanId));
  const reviewSkill = useStore((s) => s.reviewSkill);
  const [quality, setQuality] = useState(4);
  const [note, setNote] = useState('');
  const [cert, setCert] = useState(false);
  if (!artisan) return <Screen title="Review">{<Txt>Not found.</Txt>}</Screen>;
  const worker = workerId ? artisan.workers.find((w) => w.id === workerId) : undefined;
  const identity = worker?.identity ?? artisan.identity;
  const skill = (worker?.skills ?? artisan.skills).find((s) => s.categoryId === categoryId);
  const cat = category(categoryId);
  const v = skill?.video;

  const decide = (decision: 'approved' | 'rejected' | 'needs_more') => {
    if (decision === 'approved' && cat.risk === 'high' && !cert) return showMessage('Certificate required', `${cat.name} is high-risk. Confirm you checked a valid trade certificate or licence.`);
    if (decision !== 'approved' && note.trim().length < 8) return showMessage('Add a note', 'Tell the artisan what to fix.');
    const r = reviewSkill({ artisanId, workerId: workerId || undefined, categoryId, decision, quality, note: note.trim() || 'Approved after review.' });
    if (!r.ok) return showMessage('Error', r.error);
    router.back();
  };

  return (
    <Screen
      title={`Review: ${cat.name}`}
      footer={
        <>
          <Button title="Approve skill" icon="checkmark-circle" onPress={() => decide('approved')} />
          <Row gap={space.sm}>
            <Button variant="ghost" title="Need another video" full={false} style={{ flex: 1 }} onPress={() => decide('needs_more')} />
            <Button variant="danger" title="Reject" full={false} style={{ flex: 1 }} onPress={() => decide('rejected')} />
          </Row>
        </>
      }
    >
      <Row gap={space.md}>
        <Avatar name={worker?.name ?? artisan.name} color={artisan.avatarColor} size={52} />
        <View>
          <Txt v="h3">{worker?.name ?? artisan.name}</Txt>
          <Txt v="small" muted>
            {worker ? `Worker at ${artisan.businessName}` : artisan.businessName ?? 'Individual artisan'} · {artisan.city}
          </Txt>
        </View>
      </Row>
      <View style={{ height: 190, marginTop: space.lg, borderRadius: radius.lg, backgroundColor: '#0B1526', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="play-circle-outline" size={56} color="#7CC4F4" />
        <Txt v="small" color="#9DB0CC" style={{ marginTop: 6 }}>
          {v ? `${v.durationSec}s in-app recording · ${day(v.recordedAt)} ${time(v.recordedAt)}` : 'Video'}
        </Txt>
      </View>
      <Section title="Automated checks">
        <Card>
          <KeyValue k="Recorded in app" v={v?.recordedInApp ? 'Yes' : 'No'} />
          <KeyValue k="Liveness in video" v={v?.livenessPassed ? 'Passed' : 'Failed'} />
          <KeyValue k="Face match vs identity" v={v ? `${Math.round(v.faceMatchScore * 100)}% (min ${SKILL_VIDEO_FACE_THRESHOLD * 100}%)` : '—'} />
          <KeyValue k="Identity face match" v={identity.faceMatchScore ? `${Math.round(identity.faceMatchScore * 100)}%` : '—'} />
          <KeyValue k="Capture hash" v={v?.captureHash ?? '—'} />
        </Card>
      </Section>
      <Section title="What the video must show">
        <Txt muted>{cat.videoBrief}</Txt>
      </Section>
      {cat.risk === 'high' ? (
        <Section title="High-risk trade">
          <Banner tone="warning" body="Confirm the worker holds a valid certificate/licence for this trade (e.g. COREN, NABTEB, trade test) before approving." />
          {skill?.certificate ? (
            <Image source={{ uri: skill.certificate.uri }} style={{ width: '100%', height: 180, borderRadius: radius.md, marginTop: space.sm }} resizeMode="contain" />
          ) : (
            <Txt v="small" color={c.danger} style={{ marginTop: 6 }}>
              No certificate photo uploaded yet — ask for one with “Need another video”.
            </Txt>
          )}
          <Row style={{ marginTop: space.sm }}>
            <Chip label={cert ? 'Certificate checked ✓' : 'Mark certificate checked'} selected={cert} onPress={() => setCert(!cert)} />
          </Row>
        </Section>
      ) : null}
      <Section title="Proof-of-work quality">
        <Stars value={quality} size={30} onChange={setQuality} />
        <Txt v="small" muted style={{ marginTop: 6 }}>
          Quality affects ranking for this skill.
        </Txt>
      </Section>
      <AdminNotes targetType="user" targetId={artisanId} />
      <Section title="Note to artisan">
        <Field multiline value={note} onChangeText={setNote} placeholder="Required when rejecting or asking for another video." />
        <Txt v="small" color={c.textMuted}>
          Reject if the face isn’t visible, the work isn’t live, or it looks staged.
        </Txt>
      </Section>
    </Screen>
  );
}
