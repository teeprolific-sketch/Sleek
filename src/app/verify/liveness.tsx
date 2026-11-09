import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showMessage } from '../../components/domain';
import { Button, Icon, Row, Txt } from '../../components/ui';
import { pickChallenges } from '../../domain/verification';
import { useStore } from '../../store';
import { brand, space } from '../../theme';

/**
 * Active liveness: random challenge sequence each attempt, frames captured per
 * challenge with the front camera, then server-side liveness + face match
 * against the NIN record photo.
 */
export default function Liveness() {
  const { workerId } = useLocalSearchParams<{ workerId?: string }>();
  const [perm, requestPerm] = useCameraPermissions();
  const completeLiveness = useStore((s) => s.completeLiveness);
  const challenges = useMemo(() => pickChallenges(Date.now() % 9973), []);
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(-1);
  const [frames, setFrames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    let uri: string | undefined;
    if (cam.current && ready) {
      const pic = await cam.current.takePictureAsync({ quality: 0.4, skipProcessing: true, shutterSound: false });
      uri = pic?.uri;
    } else if (__DEV__) {
      uri = `dev-frame-${Date.now()}`;
    }
    if (!uri) return;
    const next = [...frames, uri];
    setFrames(next);
    if (index + 1 < challenges.length) setIndex(index + 1);
    else finish(next);
  };

  const finish = async (all: string[]) => {
    setBusy(true);
    const r = await completeLiveness(all, challenges.map((c) => c.id), workerId);
    setBusy(false);
    if (!r.ok) {
      showMessage('Face check failed', r.error);
      setIndex(-1);
      setFrames([]);
      return;
    }
    router.replace({ pathname: '/verify', params: workerId ? { workerId } : {} });
  };

  const camAvailable = perm?.granted;
  const current = index >= 0 ? challenges[index] : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
        <Icon name="close" color="#fff" size={26} style={{ opacity: 0.9 }} />
        <Txt v="bodyStrong" color="#fff">
          Face liveness check
        </Txt>
        <Txt color="#9DB0CC">{index >= 0 ? `${index + 1}/${challenges.length}` : ''}</Txt>
      </Row>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 260, height: 340, borderRadius: 170, overflow: 'hidden', borderWidth: 4, borderColor: current ? brand.sky : '#334155', backgroundColor: '#0B1526' }}>
          {camAvailable ? (
            <CameraView ref={cam} style={{ flex: 1 }} facing="front" mode="picture" onCameraReady={() => setReady(true)} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="scan-outline" size={64} color="#7CC4F4" />
            </View>
          )}
        </View>
        <View style={{ padding: space.xl, minHeight: 110 }}>
          <Txt v="h2" color="#fff" center>
            {busy ? 'Checking…' : current ? current.prompt : 'Position your face in the oval'}
          </Txt>
          <Txt color="#9DB0CC" center style={{ marginTop: 6 }}>
            {current ? 'Do the movement, then tap “Done”.' : 'Good light, no cap or glasses. The movements are random every time so recordings can’t be used.'}
          </Txt>
        </View>
      </View>
      <View style={{ padding: space.lg, gap: space.sm }}>
        {!camAvailable ? <Button title="Allow camera" onPress={requestPerm} /> : null}
        {camAvailable || __DEV__ ? (
          index < 0 ? (
            <Button title="Start" icon="scan-outline" onPress={() => setIndex(0)} disabled={busy} />
          ) : (
            <Button title="Done" icon="checkmark" onPress={capture} loading={busy} />
          )
        ) : null}
        {!camAvailable && __DEV__ ? (
          <Txt v="small" color="#9DB0CC" center>
            Dev build: continuing without a camera uses simulated frames.
          </Txt>
        ) : null}
        <Button variant="ghost" title="Cancel" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}
