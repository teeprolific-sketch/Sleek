import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, Row, Txt } from '../components/ui';
import type { UploadPurpose } from '../domain/types';
import { PURPOSE_PROMPT, resolveCapture } from '../utils/captureBus';
import { space } from '../theme';

/** Live camera capture for a single, named purpose. No gallery access. */
export default function Capture() {
  const { key, purpose } = useLocalSearchParams<{ key: string; purpose: UploadPurpose }>();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prompt = PURPOSE_PROMPT[purpose ?? 'issue_photo'];

  const take = async () => {
    if (!cam.current || !ready) return;
    setBusy(true);
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      setShot(pic?.uri ?? null);
    } finally {
      setBusy(false);
    }
  };
  const use = () => {
    if (!shot) return;
    resolveCapture(key, shot);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close camera" hitSlop={10}>
          <Icon name="close" color="#fff" size={26} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: space.md }}>
          <Txt v="bodyStrong" color="#fff" center>
            {prompt.title}
          </Txt>
          <Txt v="small" color="#BFD3EA" center>
            {prompt.hint}
          </Txt>
        </View>
        <View style={{ width: 26 }} />
      </Row>
      <View style={{ flex: 1, margin: space.md, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0B1526' }}>
        {shot ? (
          <Image source={{ uri: shot }} style={{ flex: 1 }} resizeMode="cover" />
        ) : perm?.granted ? (
          <CameraView ref={cam} style={{ flex: 1 }} facing="back" mode="picture" onCameraReady={() => setReady(true)} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
            <Icon name="camera-outline" size={48} color="#7CC4F4" />
            <Txt color="#fff" center style={{ marginTop: space.md }}>
              Sleek needs camera access for this photo. Photos can only be taken live — uploads from your gallery are not allowed.
            </Txt>
            <Button title="Allow camera" style={{ marginTop: space.lg }} onPress={requestPerm} />
            {__DEV__ ? (
              <Button
                title="Use demo photo (dev build only)"
                variant="ghost"
                style={{ marginTop: space.sm }}
                onPress={() => setShot(`https://picsum.photos/seed/${purpose}${Date.now() % 1000}/600/800`)}
              />
            ) : null}
          </View>
        )}
      </View>
      <View style={{ padding: space.lg, gap: space.sm }}>
        {shot ? (
          <Row gap={space.sm}>
            <Button title="Retake" variant="ghost" full={false} style={{ flex: 1 }} onPress={() => setShot(null)} />
            <Button title="Use photo" icon="checkmark" full={false} style={{ flex: 1 }} onPress={use} />
          </Row>
        ) : perm?.granted ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Take photo" onPress={take} disabled={busy || !ready} style={{ alignSelf: 'center', width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: '#fff', backgroundColor: busy ? '#7CC4F4' : '#0EA5E9' }} />
        ) : null}
        <Txt v="small" color="#9DB0CC" center>
          This capture is logged with its purpose and time.
        </Txt>
      </View>
    </SafeAreaView>
  );
}
