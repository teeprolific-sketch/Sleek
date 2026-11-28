import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Banner, Button, Chip, Field, Icon, Row, Screen, Spacer, Steps, Txt } from '../../components/ui';
import { CITIES } from '../../data/categories';
import type { ArtisanAccountType, AuthProvider } from '../../domain/types';
import { POLICY_VERSION, policiesFor, policy } from '../../legal/policies';
import { useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';

type Choice = 'customer' | ArtisanAccountType | 'seller';

const OPTIONS: { value: Choice; icon: string; title: string; body: string }[] = [
  { value: 'customer', icon: 'person-outline', title: 'Customer', body: 'Book verified artisans and pay safely through Sleek Hold.' },
  { value: 'individual', icon: 'construct-outline', title: 'Individual artisan', body: 'Offer your verified skills and get paid through Sleek Hold.' },
  { value: 'team', icon: 'people-outline', title: 'Team account', body: 'A small crew. Every worker is verified and has their own schedule.' },
  { value: 'agency', icon: 'business-outline', title: 'Agency / enterprise account', body: 'Many workers across trades. Assign jobs and manage calendars.' },
  { value: 'seller', icon: 'storefront-outline', title: 'Sleek Services seller', body: 'Sell or rent tools, parts and materials. Sleek riders deliver.' },
];

const CHECKS: Record<Choice, string> = {
  customer: 'Next: a quick NIN check (name must match). Then you can book.',
  individual: 'Before your account opens: NIN, liveness and face match, a guarantor, and a live skill video for each trade. Results are confirmed by email.',
  team: 'Before your account opens: your NIN and face check, a guarantor, your CAC registration (if you have one), and verified workers with live skill videos.',
  agency: 'Before your account opens: a director’s NIN and face check, a guarantor, your CAC registration, and verified workers with live skill videos.',
  seller: 'Before your store opens: NIN, liveness and face match, a guarantor and your CAC registration (if you have one).',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^(0[789][01]\d{8}|234[789][01]\d{8})$/;

export default function RoleSelect() {
  const { c } = useTheme();
  const p = useLocalSearchParams<{ provider?: AuthProvider; phone?: string; email?: string; name?: string }>();
  const provider: AuthProvider = p.provider ?? 'phone';
  const register = useStore((s) => s.register);
  const sendEmailCode = useStore((s) => s.sendEmailCode);
  const sendSignInCode = useStore((s) => s.sendSignInCode);
  const [choice, setChoice] = useState<Choice>('customer');
  const [name, setName] = useState(p.name ?? '');
  const [business, setBusiness] = useState('');
  const [email, setEmail] = useState(p.email ?? '');
  const [phone, setPhone] = useState(p.phone ?? '');
  const [city, setCity] = useState('Lagos');
  const [area, setArea] = useState('');
  const [referral, setReferral] = useState('');
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'details' | 'phone_code' | 'email_code'>('details');
  const [sent, setSent] = useState('');
  const [code, setCode] = useState('');

  const pro = choice !== 'customer';
  const needsBusiness = choice === 'team' || choice === 'agency' || choice === 'seller';
  const required = policiesFor(choice);
  const phoneKnown = !!p.phone;
  const emailKnown = !!p.email;
  const digits = phone.replace(/\D/g, '');

  const validate = () => {
    if (name.trim().split(/\s+/).length < 2) return 'Enter your first and last name exactly as on your NIN.';
    if (needsBusiness && business.trim().length < 2) return choice === 'seller' ? 'Enter your shop or business name.' : 'Enter your team, agency or company name.';
    if (!PHONE_RE.test(digits)) return 'Enter a valid Nigerian mobile number. It’s needed for job alerts and for the other side to reach you after payment.';
    if ((pro || email.trim()) && !EMAIL_RE.test(email.trim())) return pro ? 'Enter a valid email. Your verification results are sent there.' : 'Check your email address, or leave it empty.';
    if (area.trim().length < 2) return 'Enter your area, e.g. Yaba.';
    if (!required.every((id) => agreed[id])) return 'Read and agree to each policy to continue.';
    return null;
  };

  const create = () => {
    const at = new Date().toISOString();
    const res = register({
      phone: digits,
      name: name.trim(),
      role: choice === 'customer' ? 'customer' : choice === 'seller' ? 'seller' : 'artisan',
      accountType: choice === 'customer' || choice === 'seller' ? undefined : choice,
      businessName: business.trim() || undefined,
      email: email.trim() || undefined,
      city,
      area: area.trim(),
      referralCode: referral.trim() || undefined,
      authProvider: provider,
      consents: required.map((id) => ({ policyId: id, version: POLICY_VERSION, at })),
    });
    if (!res.ok) return setError(res.error);
    router.replace(choice === 'customer' ? '/verify-customer' : '/verify');
  };

  // After the details: confirm whatever the sign-in didn't already prove.
  const next = (from: 'details' | 'phone_code') => {
    if (from === 'details' && !phoneKnown) {
      setSent(sendSignInCode(digits));
      setCode('');
      return setStage('phone_code');
    }
    if (!emailKnown && email.trim() && (pro || provider === 'phone')) {
      setSent(sendEmailCode(email.trim()));
      setCode('');
      return setStage('email_code');
    }
    create();
  };

  const submit = () => {
    const err = validate();
    if (err) return setError(err);
    setError(null);
    next('details');
  };

  if (stage !== 'details') {
    const isPhone = stage === 'phone_code';
    return (
      <Screen title={isPhone ? 'Confirm your phone' : 'Confirm your email'} footer={<Button title="Confirm" onPress={() => (code === sent ? (setError(null), isPhone ? next('phone_code') : create()) : setError('That code is not correct.'))} />}>
        <Steps current={isPhone ? 0 : 1} steps={['Phone', 'Email', 'Verification', 'Account opens']} />
        <Spacer />
        <Banner tone="info" icon={isPhone ? 'chatbox-ellipses-outline' : 'mail-outline'} title={isPhone ? 'Simulated SMS (Termii)' : 'Simulated email (Resend)'} body={`Your Sleek code is ${sent}.`} />
        <Field label={isPhone ? `Code sent to ${phone}` : `Code sent to ${email}`} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="••••••" error={error} />
        <Button variant="ghost" title="Back" onPress={() => setStage('details')} />
      </Screen>
    );
  }

  return (
    <Screen title="Create your account" subtitle={provider === 'phone' ? undefined : `Signed in with ${provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : 'email'}`} footer={<Button title="Continue" onPress={submit} />}>
      <Txt v="h2">Choose your account type</Txt>
      <Spacer />
      {OPTIONS.map((o) => {
        const active = choice === o.value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => setChoice(o.value)} style={{ borderWidth: 1.5, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primarySoft : c.card, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm }}>
            <Row gap={space.md}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: active ? c.card : c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={o.icon} size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{o.title}</Txt>
                <Txt v="small" muted>
                  {o.body}
                </Txt>
              </View>
              <Icon name={active ? 'radio-button-on' : 'ellipse-outline'} size={20} color={active ? c.primary : c.textMuted} />
            </Row>
          </Pressable>
        );
      })}
      <Banner tone="primary" icon="shield-checkmark-outline" body={CHECKS[choice]} />
      <Spacer />
      <Field label="Full name (exactly as on your NIN)" value={name} onChangeText={setName} placeholder="e.g. Amaka Johnson" autoCapitalize="words" />
      {needsBusiness ? <Field label={choice === 'seller' ? 'Shop or business name' : choice === 'team' ? 'Team name' : 'Agency or company name'} value={business} onChangeText={setBusiness} placeholder={choice === 'seller' ? 'e.g. Ladipo Spares' : 'e.g. BrightClean Team'} /> : null}
      {!phoneKnown ? <Field label="Phone number" value={phone} onChangeText={setPhone} placeholder="0803 123 4567" keyboardType="phone-pad" hint="We send a code to confirm it." /> : null}
      {!emailKnown ? <Field label={pro ? 'Email' : 'Email (optional)'} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" /> : null}
      <Txt v="small" style={{ fontWeight: '600', marginBottom: 6 }}>
        City
      </Txt>
      <Row wrap gap={8} style={{ marginBottom: space.md }}>
        {CITIES.map((x) => (
          <Chip key={x} label={x} selected={city === x} onPress={() => setCity(x)} />
        ))}
      </Row>
      <Field label="Area" value={area} onChangeText={setArea} placeholder="e.g. Yaba" />
      <Field label="Referral code (optional)" value={referral} onChangeText={(t) => setReferral(t.toUpperCase())} placeholder="e.g. AMAKA1234" autoCapitalize="characters" />

      <Txt v="h3" style={{ marginTop: space.sm }}>
        Policies
      </Txt>
      <Txt v="small" muted style={{ marginBottom: space.sm }}>
        Read each one. They cover your data, Sleek Hold, fees and the penalties for lateness, no-shows and breaking the rules.
      </Txt>
      {required.map((id) => {
        const on = !!agreed[id];
        return (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8 }}>
            <Pressable onPress={() => setAgreed({ ...agreed, [id]: !on })} accessibilityRole="checkbox" accessibilityState={{ checked: on }} hitSlop={8}>
              <Icon name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? c.primary : c.textMuted} />
            </Pressable>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
              <Txt>I agree to the </Txt>
              <Pressable onPress={() => router.push({ pathname: '/policies/[id]', params: { id } })} accessibilityRole="link">
                <Txt color={c.primary} style={{ fontWeight: '700' }}>
                  {policy(id).title}
                </Txt>
              </Pressable>
            </View>
          </View>
        );
      })}
      {error ? (
        <Txt v="small" color={c.danger} style={{ marginTop: 6 }}>
          {error}
        </Txt>
      ) : null}
    </Screen>
  );
}
