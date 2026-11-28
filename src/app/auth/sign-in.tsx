import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Logo } from '../../components/Logo';
import { Banner, Button, Card, Divider, Field, Icon, ListItem, Row, Screen, Spacer, Txt } from '../../components/ui';
import type { AuthProvider } from '../../domain/types';
import { useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';

type Stage = 'choose' | 'phone' | 'phone_code' | 'email' | 'email_code' | 'google' | 'apple';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Sign in or sign up: Google, Apple, email or phone. New people then pick their
 * account type, agree to the policies and verify before the account opens.
 * Production: Google / Apple via their sign-in SDKs, codes via Termii (SMS) and Resend (email).
 */
export default function SignIn() {
  const { c } = useTheme();
  const [stage, setStage] = useState<Stage>('choose');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState('');
  const [tries, setTries] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signInDemo = useStore((s) => s.signInDemo);
  const sendSignInCode = useStore((s) => s.sendSignInCode);
  const sendEmailCode = useStore((s) => s.sendEmailCode);
  const logProvider = useStore((s) => s.logProvider);

  const digits = phone.replace(/\D/g, '');
  const go = (s: Stage) => {
    setError(null);
    setCode('');
    setStage(s);
  };

  /** Signs an existing person in, or sends a new person to account setup. */
  const finish = (provider: AuthProvider, by: { phone?: string; email?: string; name?: string }) => {
    const st = useStore.getState();
    const people = [...st.customers, ...st.artisans, ...st.sellers];
    const found = by.phone ? people.find((u) => u.phone.replace(/\D/g, '').slice(-10) === by.phone!.slice(-10)) : people.find((u) => 'email' in u && u.email?.toLowerCase() === by.email!.toLowerCase());
    if (found) {
      useStore.setState({ session: { userId: found.id, role: found.role, phone: found.phone, token: `tok_${Date.now()}` }, onboarded: true });
      return router.replace('/');
    }
    router.push({ pathname: '/auth/role', params: { provider, phone: by.phone ?? '', email: by.email ?? '', name: by.name ?? '' } });
  };

  const checkCode = (then: () => void) => {
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code.');
    if (tries >= 4) return setError('Too many wrong codes. Request a new one.');
    if (code !== sent) {
      setTries(tries + 1);
      return setError(`That code is not correct. ${4 - tries} attempt${4 - tries === 1 ? '' : 's'} left.`);
    }
    then();
  };

  const social = (p: 'google' | 'apple') => {
    if (name.trim().split(/\s+/).length < 2) return setError('Enter your first and last name.');
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    logProvider('email', 'oauth', `${p === 'google' ? 'Google' : 'Apple'} sign-in (simulated): ${email.trim()} verified by ${p === 'google' ? 'Google' : 'Apple'}`);
    finish(p, { email: email.trim(), name: name.trim() });
  };

  const Option = ({ icon, label, onPress, dark }: { icon: string; label: string; onPress: () => void; dark?: boolean }) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: dark ? c.text : c.border, backgroundColor: dark ? c.text : c.card, marginBottom: space.sm }}>
      <Icon name={icon} size={20} color={dark ? c.bg : c.text} />
      <Txt v="bodyStrong" color={dark ? c.bg : c.text}>
        {label}
      </Txt>
    </Pressable>
  );

  return (
    <Screen back={false}>
      <View style={{ alignItems: 'flex-start' }}>
        <Logo height={34} />
        <Spacer h={space.xl} />
        <Txt v="h1">
          {stage === 'choose' ? 'Welcome to Sleek' : stage === 'google' ? 'Continue with Google' : stage === 'apple' ? 'Continue with Apple' : stage.startsWith('email') ? 'Continue with email' : 'Continue with phone'}
        </Txt>
        <Txt muted style={{ marginTop: 6 }}>
          {stage === 'choose' ? 'Sign in or create an account. Every account is verified before it opens.' : stage === 'phone_code' ? `We sent a code to ${phone}.` : stage === 'email_code' ? `We sent a code to ${email}.` : 'Your details are never shown to other users.'}
        </Txt>
      </View>
      <Spacer h={space.xl} />

      {stage === 'choose' ? (
        <>
          <Option icon="logo-google" label="Continue with Google" onPress={() => go('google')} />
          <Option icon="logo-apple" label="Continue with Apple" onPress={() => go('apple')} dark />
          <Option icon="mail-outline" label="Continue with email" onPress={() => go('email')} />
          <Option icon="call-outline" label="Continue with phone number" onPress={() => go('phone')} />
        </>
      ) : stage === 'google' || stage === 'apple' ? (
        <>
          <Banner tone="info" icon="flask-outline" title={`Simulated ${stage === 'google' ? 'Google' : 'Apple'} sign-in`} body={`In the real app this opens ${stage === 'google' ? 'Google' : 'Apple'}’s own sign-in and returns your verified name and email.`} />
          <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="e.g. Amaka Johnson" />
          <Field label={`${stage === 'google' ? 'Google' : 'Apple'} email`} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@gmail.com" error={error} />
          <Button title="Continue" onPress={() => social(stage)} />
          <Button variant="ghost" title="Other options" onPress={() => go('choose')} />
        </>
      ) : stage === 'email' ? (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" error={error} />
          <Button
            title="Send code"
            loading={loading}
            onPress={() => {
              if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
              setLoading(true);
              setTimeout(() => {
                setSent(sendEmailCode(email.trim()));
                setTries(0);
                setLoading(false);
                go('email_code');
              }, 600);
            }}
          />
          <Button variant="ghost" title="Other options" onPress={() => go('choose')} />
        </>
      ) : stage === 'email_code' ? (
        <>
          <Banner tone="info" icon="mail-outline" title="Simulated email (Resend)" body={`Your Sleek confirmation code is ${sent}.`} />
          <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="••••••" error={error} />
          <Button title="Verify & continue" onPress={() => checkCode(() => finish('email', { email: email.trim() }))} />
          <Button variant="ghost" title="Change email" onPress={() => go('email')} />
        </>
      ) : stage === 'phone' ? (
        <>
          <Field label="Phone number" placeholder="0803 123 4567" keyboardType="phone-pad" value={phone} onChangeText={setPhone} error={error} autoComplete="tel" />
          <Button
            title="Send code"
            loading={loading}
            onPress={() => {
              if (!/^(0[789][01]\d{8}|234[789][01]\d{8})$/.test(digits)) return setError('Enter a valid Nigerian mobile number, e.g. 0803 123 4567.');
              setLoading(true);
              setTimeout(() => {
                setSent(sendSignInCode(digits));
                setTries(0);
                setLoading(false);
                go('phone_code');
              }, 600);
            }}
          />
          <Button variant="ghost" title="Other options" onPress={() => go('choose')} />
        </>
      ) : (
        <>
          <Banner tone="info" icon="chatbox-ellipses-outline" title="Simulated SMS (Termii)" body={`Sleek: your sign-in code is ${sent}. Never share it with anyone.`} />
          <Field label="6-digit code" placeholder="••••••" keyboardType="number-pad" maxLength={6} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} error={error} />
          <Button title="Verify & continue" onPress={() => checkCode(() => finish('phone', { phone: digits }))} />
          <Button variant="ghost" title="Change number" onPress={() => go('phone')} />
        </>
      )}

      <Divider />
      <Txt v="h3">Explore with a demo account</Txt>
      <Txt v="small" muted style={{ marginBottom: space.sm }}>
        Already verified, so you can try every flow.
      </Txt>
      <Card>
        {(
          [
            ['customer', 'person-outline', 'Customer', 'Amaka · Yaba, Lagos'],
            ['artisan', 'construct-outline', 'Individual artisan', 'Tunde · Auto mechanic'],
            ['team', 'people-outline', 'Team account', 'BrightClean Team · 4 workers'],
            ['agency', 'business-outline', 'Agency account', 'BuildPro Services · 5 workers'],
            ['seller', 'storefront-outline', 'Sleek Services seller', 'Ladipo Spares · car parts'],
          ] as const
        ).map(([k, icon, title, sub]) => (
          <ListItem
            key={k}
            icon={icon}
            title={title}
            subtitle={sub}
            onPress={() => {
              signInDemo(k);
              router.replace('/');
            }}
          />
        ))}
      </Card>
      <Spacer />
      <Row gap={6} style={{ justifyContent: 'center' }}>
        <Txt v="small" muted>
          By continuing you agree to the
        </Txt>
        <Pressable onPress={() => router.push('/policies')}>
          <Txt v="small" color={c.primary} style={{ fontWeight: '700' }}>
            Sleek policies
          </Txt>
        </Pressable>
      </Row>
    </Screen>
  );
}
