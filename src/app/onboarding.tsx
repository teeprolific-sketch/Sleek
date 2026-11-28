import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '../components/Logo';
import { Button, Icon, Row, Txt } from '../components/ui';
import { useStore } from '../store';
import { space, useTheme } from '../theme';

const SLIDES = [
  {
    icon: 'shield-checkmark',
    title: 'Verified artisans only',
    body: 'Every artisan passes NIN, face liveness and a separate proof-of-work video for each skill they offer.',
  },
  {
    icon: 'lock-closed',
    title: 'Your money stays in Sleek Hold',
    body: 'Agree a price in chat, pay into Sleek Hold, and release it only when you are happy with the work.',
  },
  {
    icon: 'chatbubbles',
    title: 'Safe, in-app chat',
    body: 'No phone numbers, no off-app deals. Your address is shared only after payment is secured.',
  },
  {
    icon: 'cube',
    title: 'Sleek Services',
    body: 'Buy tools and materials at partner prices, or rent cars, generators, chairs, cameras and more.',
  },
];

export default function Onboarding() {
  const { c } = useTheme();
  const [i, setI] = useState(0);
  const done = useStore((s) => s.completeOnboarding);
  const finish = () => {
    done();
    router.replace('/auth/sign-in');
  };
  const s = SLIDES[i];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ justifyContent: 'space-between', padding: space.lg }}>
        <Logo height={28} />
        <Pressable onPress={finish} hitSlop={10} accessibilityRole="button">
          <Txt muted>Skip</Txt>
        </Pressable>
      </Row>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={s.icon} size={64} color={c.primary} />
        </View>
        <Txt v="h1" center style={{ marginTop: space.xxl }}>
          {s.title}
        </Txt>
        <Txt muted center style={{ marginTop: space.md, maxWidth: 320 }}>
          {s.body}
        </Txt>
      </View>
      <Row gap={8} style={{ justifyContent: 'center', marginBottom: space.xl }}>
        {SLIDES.map((_, k) => (
          <View key={k} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? c.primary : c.border }} />
        ))}
      </Row>
      <View style={{ padding: space.lg }}>
        <Button title={i === SLIDES.length - 1 ? 'Get started' : 'Next'} onPress={() => (i === SLIDES.length - 1 ? finish() : setI(i + 1))} />
      </View>
    </SafeAreaView>
  );
}
