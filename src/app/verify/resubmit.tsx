import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Card, Icon, Pill, Row, Screen, Section, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { MIN_SKILL_VIDEO_SEC, SKILL_STATUS_LABEL } from '../../domain/verification';
import { useMyArtisan, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { requestCapture } from '../../utils/captureBus';
import { day } from '../../utils/format';

/** When a skill video is rejected or more proof is needed: what went wrong and how to fix it. */
export default function Resubmit() {
  const { c } = useTheme();
  const { categoryId, workerId } = useLocalSearchParams<{ categoryId: string; workerId?: string }>();
  const me = useMyArtisan();
  const submitCertificate = useStore((s) => s.submitCertificate);
  const logCapture = useStore((s) => s.logCapture);
  const worker = me?.workers.find((w) => w.id === workerId);
  const skill = (worker?.skills ?? me?.skills ?? []).find((s) => s.categoryId === categoryId);
  const cat = category(categoryId);
  if (!me || !skill) return <Screen title="Re-submit">{<Txt>Nothing to re-submit.</Txt>}</Screen>;
  const needsCert = cat.risk === 'high';
  const wq = workerId ? { workerId } : {};

  const checklist = [
    { ok: true, text: 'Record inside the Sleek app (no uploads)' },
    { ok: true, text: `At least ${MIN_SKILL_VIDEO_SEC} seconds of real, live work` },
    { ok: true, text: 'Your face clearly visible at the start and end' },
    { ok: true, text: 'Good light, steady camera, the work in frame' },
    ...(needsCert ? [{ ok: !!skill.certificate, text: 'Photo of your trade certificate or licence' }] : []),
  ];

  return (
    <Screen title={`Re-submit: ${cat.name}`} subtitle={worker ? `For ${worker.name}` : undefined}>
      <Row gap={6}>
        <Pill label={SKILL_STATUS_LABEL[skill.status]} tone={skill.status === 'needs_more' ? 'warning' : 'danger'} />
        {skill.decidedAt ? (
          <Txt v="small" muted>
            Reviewed {day(skill.decidedAt)}
          </Txt>
        ) : null}
      </Row>
      <View style={{ marginTop: space.md }}>
        {skill.status === 'in_review' ? (
          <Banner tone="info" title="Your video is being reviewed" body="This is a high-risk trade. Add a clear photo of your certificate or licence so the reviewer can approve you." />
        ) : (
          <Banner tone={skill.status === 'needs_more' ? 'warning' : 'danger'} title="Reviewer’s note" body={skill.reviewerNote ?? 'Your video didn’t pass the checks. Please record a new one.'} />
        )}
      </View>
      <Section title="What the video must show">
        <Txt muted>{cat.videoBrief}</Txt>
      </Section>
      <Section title="Before you record">
        <Card>
          {checklist.map((x) => (
            <Row key={x.text} gap={8} style={{ paddingVertical: 4 }}>
              <Icon name={x.ok ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={x.ok ? c.success : c.textMuted} />
              <Txt style={{ flex: 1 }}>{x.text}</Txt>
            </Row>
          ))}
        </Card>
      </Section>
      {needsCert ? (
        <Section title="Certificate (high-risk trade)">
          {skill.certificate ? (
            <Row gap={space.md}>
              <Image source={{ uri: skill.certificate.uri }} style={{ width: 90, height: 64, borderRadius: radius.sm }} />
              <Txt v="small" muted style={{ flex: 1 }}>
                Certificate uploaded {day(skill.certificate.capturedAt)}. A reviewer will check it with your video.
              </Txt>
            </Row>
          ) : null}
          <Button
            variant="secondary"
            icon="document-attach-outline"
            title={skill.certificate ? 'Retake certificate photo' : 'Photograph certificate'}
            style={{ marginTop: space.sm }}
            onPress={() =>
              requestCapture('certificate', (uri) => {
                const r = submitCertificate(categoryId, logCapture('certificate', uri), workerId);
                if (!r.ok) showMessage('Not saved', r.error);
              })
            }
          />
        </Section>
      ) : null}
      {skill.status === 'in_review' ? null : <Button title="Record a new video" icon="videocam-outline" style={{ marginTop: space.xl }} onPress={() => router.push({ pathname: '/verify/skill', params: { categoryId, ...wq } })} />}
      <Txt v="small" muted center style={{ marginTop: space.sm }}>
        Repeated attempts with someone else’s face or pre-recorded footage lead to account suspension.
      </Txt>
    </Screen>
  );
}
