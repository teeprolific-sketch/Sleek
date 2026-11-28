import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Logo } from '../components/Logo';
import { Txt } from '../components/ui';
import { useIsSuspended, useStore } from '../store';
import { useTheme } from '../theme';

/** Splash → routes the user to onboarding, sign-in or their role's home. */
export default function Splash() {
  const onboarded = useStore((s) => s.onboarded);
  const session = useStore((s) => s.session);
  const { c, isDark } = useTheme();
  const { suspended } = useIsSuspended();
  const customerVerified = useStore((s) => s.customers.find((c) => c.id === s.session.userId)?.identity?.nin === 'passed');
  const proActive = useStore((s) => !!(s.artisans.find((a) => a.id === s.session.userId) ?? s.sellers.find((x) => x.id === s.session.userId))?.activatedAt);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (ready) {
    if (!onboarded) return <Redirect href="/onboarding" />;
    if (!session.userId) return <Redirect href="/auth/sign-in" />;
    if (suspended) return <Redirect href="/suspended" />;
    if (session.role === 'customer') return <Redirect href={customerVerified ? '/home' : '/verify-customer'} />;
    if (session.role === 'artisan') return <Redirect href={proActive ? '/dashboard' : '/verify'} />;
    if (session.role === 'seller') return <Redirect href={proActive ? '/seller' : '/verify'} />;
    return <Redirect href="/auth/sign-in" />;
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
