import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Logo } from '../components/Logo';
import { Txt } from '../components/ui';
import { useStore } from '../store';
import { useTheme } from '../theme';

/** Splash → routes the user to onboarding, sign-in or their role's home. */
export default function Splash() {
  const onboarded = useStore((s) => s.onboarded);
  const session = useStore((s) => s.session);
  const { c, isDark } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (ready) {
    if (!onboarded) return <Redirect href="/onboarding" />;
    if (!session.userId) return <Redirect href="/auth/sign-in" />;
    if (session.role === 'customer') return <Redirect href="/home" />;
    if (session.role === 'artisan') return <Redirect href="/dashboard" />;
    return <Redirect href="/admin" />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Logo height={64} />
      <Txt muted style={{ marginTop: 12 }}>
        Trusted artisans. Protected payments.
      </Txt>
      <Txt v="small" color={c.textMuted} style={{ position: 'absolute', bottom: 48, fontWeight: '700' }}>
        by Me AI
      </Txt>
    </View>
  );
}
