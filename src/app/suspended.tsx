import { router } from 'expo-router';
import React from 'react';
import { Banner, Button, Screen, Spacer, Txt } from '../components/ui';
import { useIsSuspended, useStore } from '../store';

export default function Suspended() {
  const { reason } = useIsSuspended();
  const signOut = useStore((s) => s.signOut);
  return (
    <Screen title="Account suspended" back={false}>
      <Banner tone="danger" icon="ban-outline" title="Your account is suspended" body={reason ?? 'Sleek’s Trust team suspended this account.'} />
      <Spacer />
      <Txt muted>Any money held in Sleek Hold for you is safe. Talk to Sleek Support to understand what happened and how to fix it.</Txt>
      <Spacer />
      <Button title="Talk to Sleek Support" icon="chatbubbles-outline" onPress={() => router.push('/support')} />
      <Spacer />
      <Button
        variant="ghost"
        title="Sign out"
        onPress={() => {
          signOut();
          router.replace('/auth/sign-in');
        }}
      />
    </Screen>
  );
}
