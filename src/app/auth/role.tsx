import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Chip, Field, Icon, Row, Screen, Spacer, Txt } from '../../components/ui';
import { CITIES } from '../../data/categories';
import type { ArtisanAccountType } from '../../domain/types';
import { useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';

type Choice = 'customer' | ArtisanAccountType;

const OPTIONS: { value: Choice; icon: string; title: string; body: string }[] = [
  { value: 'customer', icon: 'person-outline', title: 'I need an artisan', body: 'Find, chat with and pay verified artisans safely.' },
  { value: 'individual', icon: 'construct-outline', title: 'I’m an artisan', body: 'Offer your verified skills and get paid through escrow.' },
  { value: 'team', icon: 'people-outline', title: 'I lead a team', body: 'A small crew. Each worker is verified and has their own schedule.' },
  { value: 'agency', icon: 'business-outline', title: 'I run an agency', body: 'Many workers across trades. Assign jobs and manage calendars.' },
];

export default function RoleSelect() {
  const { c } = useTheme();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const register = useStore((s) => s.register);
  const [choice, setChoice] = useState<Choice>('customer');
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [city, setCity] = useState('Lagos');
  const [area, setArea] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (name.trim().split(/\s+/).length < 2) return setError('Enter your first and last name as on your NIN.');
    if (choice !== 'customer' && choice !== 'individual' && business.trim().length < 2) return setError('Enter your team or agency name.');
    if (area.trim().length < 2) return setError('Enter your area, e.g. Yaba.');
    register({
      phone: phone ?? '',
      name: name.trim(),
      role: choice === 'customer' ? 'customer' : 'artisan',
      accountType: choice === 'customer' ? undefined : choice,
      businessName: business.trim() || undefined,
      city,
      area: area.trim(),
    });
    router.replace(choice === 'customer' ? '/home' : '/verify');
  };

  return (
    <Screen title="Create your account" footer={<Button title="Continue" onPress={submit} />}>
      <Txt v="h2">How will you use Sleek?</Txt>
      <Spacer />
      {OPTIONS.map((o) => {
        const active = choice === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => setChoice(o.value)}
            style={{ borderWidth: 2, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primarySoft : c.card, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm }}
          >
            <Row gap={space.md}>
              <Icon name={o.icon} size={24} color={c.primary} />
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
      <Spacer h={space.lg} />
      <Field label="Full name (as on your NIN)" value={name} onChangeText={setName} placeholder="e.g. Amaka Johnson" autoCapitalize="words" />
      {choice === 'team' || choice === 'agency' ? (
        <Field label={choice === 'team' ? 'Team name' : 'Agency name'} value={business} onChangeText={setBusiness} placeholder="e.g. BrightClean Team" />
      ) : null}
      <Txt v="small" style={{ fontWeight: '600', marginBottom: 6 }}>
        City
      </Txt>
      <Row wrap gap={8} style={{ marginBottom: space.md }}>
        {CITIES.map((x) => (
          <Chip key={x} label={x} selected={city === x} onPress={() => setCity(x)} />
        ))}
      </Row>
      <Field label="Area" value={area} onChangeText={setArea} placeholder="e.g. Yaba" error={error} />
      {choice !== 'customer' ? (
        <Txt v="small" muted>
          Next you’ll verify your identity (NIN + face) and record a short video for each skill. You can only receive jobs for skills that are verified.
        </Txt>
      ) : null}
    </Screen>
  );
}
