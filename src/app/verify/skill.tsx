import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showMessage } from '../../components/domain';
import { Banner, Button, Icon, Row, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { MAX_SKILL_VIDEO_SEC, MIN_SKILL_VIDEO_SEC } from '../../domain/verification';
import { useMyArtisan, useStore } from '../../store';
import { space } from '../../theme';
import { DEMO_CAPTURE } from '../../utils/demo';

/** In-app proof-of-work video for ONE skill. No uploads from the gallery. */
export default function SkillVideo() {
  const { categoryId, workerId } = useLocalSearchParams<{ categoryId: string; workerId?: string }>();
  const cat = category(categoryId);
  const me = useMyArtisan();
  const submit = useStore((s) => s.submitSkillVideo);
  const [cameraPerm, requestCamera] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<{ uri: string; duration: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [recording]);

  const start = async () => {
    if (!cam.current || !ready) return;
    setRecording(true);
    setSeconds(0);
    startedAt.current = Date.now();
    try {
      const video = await cam.current.recordAsync({ maxDuration: MAX_SKILL_VIDEO_SEC });
      const duration = Math.round((Date.now() - startedAt.current) / 1000);
      if (video?.uri) setResult({ uri: video.uri, duration });
    } catch (e) {
      showMessage('Recording stopped', (e as Error).message);
    } finally {
      setRecording(false);
    }
  };
  const stop = () => cam.current?.stopRecording();

  const send = async (uri: string, duration: number) => {
    setBusy(true);
    const r = await submit({ categoryId, uri, durationSec: duration, workerId });
    setBusy(false);
    if (!r.ok) {
      showMessage('Video not accepted', r.error);
      setResult(null);
      return;
    }
    showMessage('Video submitted', cat.risk === 'high' ? `${cat.name} is a high-risk trade. A reviewer will check your video and may ask for a certificate.` : 'A reviewer will check your video, usually within 24 hours.');
    router.replace({ pathname: '/verify', params: workerId ? { workerId } : {} });
  };

  const worker = me?.workers.find((w) => w.id === workerId);
  const granted = cameraPerm?.granted;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <Row style={{ padding: space.lg }} gap={space.md}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close">
          <Icon name="close" color="#fff" size={26} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Txt v="bodyStrong" color="#fff">
            {cat.name} — proof of work
          </Txt>
          <Txt v="small" color="#9DB0CC">
            {worker ? `Recording for ${worker.name}` : 'Live, in-app recording only'}
          </Txt>
        </View>
        {granted && !recording ? (
          <Pressable onPress={() => setFacing(facing === 'front' ? 'back' : 'front')} accessibilityLabel="Flip camera" hitSlop={10}>
            <Icon name="camera-reverse-outline" color="#fff" size={24} />
          </Pressable>
        ) : null}
      </Row>
      <View style={{ paddingHorizontal: space.lg }}>
        <Banner tone="info" icon="videocam-outline" body={cat.videoBrief} />
      </View>
      <View style={{ flex: 1, margin: space.md, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0B1526' }}>
        {granted ? (
          <CameraView ref={cam} style={{ flex: 1 }} facing={facing} mode="video" mute={!micPerm?.granted} onCameraReady={() => setReady(true)} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
            <Icon name="videocam-outline" size={48} color="#7CC4F4" />
            <Txt color="#fff" center style={{ marginTop: space.md }}>
              Camera and microphone access are needed to record your skill video.
            </Txt>
            <Button
              title="Allow camera & mic"
              style={{ marginTop: space.lg }}
              onPress={async () => {
                await requestCamera();
                await requestMic();
              }}
            />
          </View>
        )}
        {recording ? (
          <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />
            <Txt v="small" color="#fff">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} {seconds < MIN_SKILL_VIDEO_SEC ? `· min ${MIN_SKILL_VIDEO_SEC}s` : '· ok'}
            </Txt>
          </View>
        ) : null}
      </View>
      <View style={{ padding: space.lg, gap: space.sm }}>
        {result ? (
          <>
            <Txt color="#fff" center>
              Recorded {result.duration}s. Liveness and face match run on submit.
            </Txt>
            <Row gap={space.sm}>
              <Button title="Record again" variant="ghost" full={false} style={{ flex: 1 }} onPress={() => setResult(null)} />
              <Button title="Submit video" icon="cloud-upload-outline" full={false} style={{ flex: 1 }} loading={busy} onPress={() => send(result.uri, result.duration)} />
            </Row>
          </>
        ) : granted ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
            onPress={recording ? stop : start}
            disabled={!ready}
            style={{ alignSelf: 'center', width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: recording ? 28 : 54, height: recording ? 28 : 54, borderRadius: recording ? 6 : 27, backgroundColor: '#EF4444' }} />
          </Pressable>
        ) : DEMO_CAPTURE ? (
          <Button title="Submit a simulated 45s video (preview only)" variant="ghost" loading={busy} onPress={() => send(`dev-video-${Date.now()}.mp4`, 45)} />
        ) : null}
        <Txt v="small" color="#9DB0CC" center>
          Start and end with your face clearly visible. {MIN_SKILL_VIDEO_SEC}s–{MAX_SKILL_VIDEO_SEC / 60} min.
        </Txt>
      </View>
    </SafeAreaView>
  );
}
