import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, Chip, Field, Icon, ListItem, Row, Screen, Steps, Txt } from '../components/ui';
import { CITIES } from '../data/categories';
import { identityVerified } from '../domain/trust';
import { useMyArtisan, useStore } from '../store';
import { space, useTheme } from '../theme';

const AREAS: Record<string, string[]> = {
  Lagos: ['Yaba', 'Surulere', 'Ikeja', 'Lekki Phase 1', 'Victoria Island', 'Ikoyi', 'Ajah', 'Magodo', 'Gbagada', 'Festac', 'Ikorodu', 'Apapa'],
  Abuja: ['Wuse 2', 'Garki', 'Maitama', 'Gwarinpa', 'Asokoro', 'Jabi', 'Kubwa', 'Lugbe'],
  'Port Harcourt': ['GRA Phase 2', 'Rumuola', 'Trans-Amadi'],
};
const SIZES = [2, 3, 5, 10, 20, 50];

/**
 * Separate onboarding for Team and Agency accounts:
 * business details → owner verification → first workers → payout → calendar mode.
 */
export default function BusinessOnboarding() {
  const { c } = useTheme();
  const me = useMyArtisan();
  const complete = useStore((s) => s.completeBusinessOnboarding);
  const updateProfile = useStore((s) => s.updateArtisanProfile);
  const [step, setStep] = useState(0);
  const [cac, setCac] = useState(me?.business?.cacNumber ?? '');
  const [areas, setAreas] = useState<string[]>(me?.business?.serviceAreas ?? (me ? [me.area] : []));
  const [size, setSize] = useState(me?.business?.teamSize ?? 3);
  if (!me || me.accountType === 'individual') return <Screen title="Business setup">{<Txt>For Team and Agency accounts.</Txt>}</Screen>;
  const isAgency = me.accountType === 'agency';
  const verified = identityVerified(me.identity);
  const activeWorkers = me.workers.filter((w) => w.active).length;
  const STEPS = ['Business details', 'Verify yourself (owner)', 'Add your first workers', 'Payout account', 'Calendar mode'];
  const cityAreas = AREAS[me.city] ?? [me.area];

  const finish = () => {
    const r = complete({ cacNumber: cac.trim() || undefined, serviceAreas: areas, teamSize: size, completedOnboarding: true });
    if (!r.ok) {
      setStep(0);
      return showMessage('Check your business details', r.error);
    }
    router.replace('/dashboard');
  };

  return (
    <Screen title={isAgency ? 'Set up your agency' : 'Set up your team'} subtitle={me.businessName}>
      <Card>
        <Steps current={step} steps={STEPS} />
      </Card>
      <View style={{ marginTop: space.lg }}>
        {step === 0 ? (
          <>
            <Txt v="h2">Business details</Txt>
            <Field label={isAgency ? 'CAC registration number (required)' : 'CAC registration number (optional)'} placeholder="e.g. RC 1234567 or BN 1234567" value={cac} onChangeText={setCac} autoCapitalize="characters" />
            <Txt v="small" style={{ fontWeight: '600', marginBottom: 6 }}>
              Areas you serve in {me.city}
            </Txt>
            <Row wrap gap={8} style={{ marginBottom: space.md }}>
              {cityAreas.map((a) => (
                <Chip key={a} label={a} selected={areas.includes(a)} onPress={() => setAreas(areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a])} />
              ))}
            </Row>
            <Txt v="small" style={{ fontWeight: '600', marginBottom: 6 }}>
              How many workers do you have?
            </Txt>
            <Row wrap gap={8}>
              {SIZES.map((n) => (
                <Chip key={n} label={n === 50 ? '50+' : String(n)} selected={size === n} onPress={() => setSize(n)} />
              ))}
            </Row>
            <Button title="Continue" style={{ marginTop: space.xl }} disabled={!areas.length || (isAgency && !cac.trim())} onPress={() => setStep(1)} />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <Txt v="h2">Verify yourself first</Txt>
            <Txt muted style={{ marginVertical: space.sm }}>
              As the account owner, you pass the same NIN, liveness and face checks as every worker. You’re responsible for your team’s conduct.
            </Txt>
            {verified ? <Banner tone="success" body="You’re identity verified." /> : <Button variant="secondary" icon="finger-print-outline" title="Verify my identity" onPress={() => router.push('/verify')} />}
            <Button title={verified ? 'Continue' : 'I’ll do this later'} variant={verified ? 'primary' : 'ghost'} style={{ marginTop: space.lg }} onPress={() => setStep(2)} />
          </>
        ) : null}
        {step === 2 ? (
          <>
            <Txt v="h2">Add your first workers</Txt>
            <Txt muted style={{ marginVertical: space.sm }}>
              Each worker verifies their own identity and records their own skill videos. Your account is bookable as soon as one verified worker is ready.
            </Txt>
            <Card>
              <ListItem icon="person-add-outline" title="Add a worker" subtitle={`${activeWorkers} added so far`} onPress={() => router.push('/team/add')} />
              <ListItem icon="people-outline" title="Manage team" onPress={() => router.push('/team')} />
            </Card>
            <Button title="Continue" style={{ marginTop: space.lg }} onPress={() => setStep(3)} />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <Txt v="h2">Where should we pay you?</Txt>
            <Txt muted style={{ marginVertical: space.sm }}>
              Payouts go to the owner’s account in the verified name{isAgency ? ' (or the business account registered with CAC)' : ''}.
            </Txt>
            {me.payoutAccount ? <Banner tone="success" body={`${me.payoutAccount.bankName} ••${me.payoutAccount.accountNumberLast4}`} /> : <Button variant="secondary" icon="card-outline" title="Add payout account" onPress={() => router.push('/payout-account')} />}
            <Button title="Continue" style={{ marginTop: space.lg }} onPress={() => setStep(4)} />
          </>
        ) : null}
        {step === 4 ? (
          <>
            <Txt v="h2">How do you manage bookings?</Txt>
            {(['shared', 'individual'] as const).map((m) => (
              <Card key={m} onPress={() => updateProfile({ calendarMode: m })} style={{ marginTop: space.sm, borderWidth: me.calendarMode === m ? 2 : 1, borderColor: me.calendarMode === m ? c.primary : c.border }}>
                <Row gap={space.md}>
                  <Icon name={m === 'shared' ? 'people-outline' : 'person-outline'} color={c.primary} />
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyStrong">{m === 'shared' ? 'Shared calendar' : 'Individual calendars'}</Txt>
                    <Txt v="small" muted>
                      {m === 'shared' ? 'You (and supervisors) assign every job.' : 'Each worker manages their own bookings; you see everything.'}
                    </Txt>
                  </View>
                </Row>
              </Card>
            ))}
            <Button title="Finish setup" icon="checkmark" style={{ marginTop: space.xl }} onPress={finish} />
          </>
        ) : null}
        {step > 0 ? <Button variant="ghost" small title="Back" style={{ marginTop: space.sm }} onPress={() => setStep(step - 1)} /> : null}
      </View>
    </Screen>
  );
}
