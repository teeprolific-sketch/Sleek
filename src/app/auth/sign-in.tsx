import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Logo } from '../../components/Logo';
import { Banner, Button, Card, Divider, Field, ListItem, Screen, Spacer, Txt } from '../../components/ui';
import { useStore } from '../../store';
import { space, useTheme } from '../../theme';

/**
 * Phone + OTP sign-in. In production the OTP is sent by the backend (SMS/WhatsApp
 * OTP via a provider such as Termii) and verified server-side.
 */
export default function SignIn() {
  const { c } = useTheme();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signInDemo = useStore((s) => s.signInDemo);

  const digits = phone.replace(/\D/g, '');
  const validPhone = /^(0[789][01]\d{8}|234[789][01]\d{8})$/.test(digits);

  const sendCode = () => {
    if (!validPhone) return setError('Enter a valid Nigerian mobile number, e.g. 0803 123 4567.');
    setError(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStage('otp');
    }, 700);
  };
  const verify = () => {
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code.');
    setError(null);
    router.push({ pathname: '/auth/role', params: { phone: digits } });
  };
  const demo = (k: Parameters<typeof signInDemo>[0]) => {
    signInDemo(k);
    router.replace('/');
  };

  return (
    <Screen back={false}>
      <View style={{ alignItems: 'flex-start' }}>
        <Logo height={34} />
        <Spacer h={space.xl} />
        <Txt v="h1">{stage === 'phone' ? 'Sign in or create an account' : 'Enter your code'}</Txt>
        <Txt muted style={{ marginTop: 6 }}>
          {stage === 'phone' ? 'We’ll text you a 6-digit code. Your number is never shown to anyone on Sleek.' : `We sent a code to ${phone}.`}
        </Txt>
      </View>
      <Spacer h={space.xl} />
      {stage === 'phone' ? (
        <>
          <Field label="Phone number" placeholder="0803 123 4567" keyboardType="phone-pad" value={phone} onChangeText={setPhone} error={error} autoComplete="tel" />
          <Button title="Send code" onPress={sendCode} loading={loading} />
        </>
      ) : (
        <>
          <Field label="6-digit code" placeholder="••••••" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} error={error} hint="Demo build: any 6 digits work." />
          <Button title="Verify & continue" onPress={verify} />
          <Spacer />
          <Button title="Change number" variant="ghost" onPress={() => setStage('phone')} />
        </>
      )}

      <Divider />
      <Txt v="h3">Explore with a demo account</Txt>
      <Txt v="small" muted style={{ marginBottom: space.sm }}>
        Pre-filled accounts so you can try every flow.
      </Txt>
      <Card>
        <ListItem icon="person-outline" title="Customer" subtitle="Amaka · Yaba, Lagos" onPress={() => demo('customer')} />
        <ListItem icon="construct-outline" title="Individual artisan" subtitle="Tunde · Auto mechanic" onPress={() => demo('artisan')} />
        <ListItem icon="people-outline" title="Team account" subtitle="BrightClean Team · 4 workers" onPress={() => demo('team')} />
        <ListItem icon="business-outline" title="Agency account" subtitle="BuildPro Services · 5 workers" onPress={() => demo('agency')} />
        <ListItem icon="shield-half-outline" title="Sleek admin" subtitle="Verification, disputes, rule-breaking" onPress={() => demo('admin')} />
      </Card>
      <Spacer />
      <Banner tone="primary" icon="lock-closed" body="Sleek never asks for your password, PIN or card details in chat." />
      <Txt v="small" center style={{ marginTop: space.xl, color: c.textMuted, fontWeight: '700' }}>
        Sleek by Me AI
      </Txt>
    </Screen>
  );
}
