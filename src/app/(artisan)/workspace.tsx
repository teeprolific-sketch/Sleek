import { router } from 'expo-router';
import React from 'react';
import { ListItem, Pill, Section } from '../../components/ui';
import { identityVerified } from '../../domain/trust';
import Account from '../../screens/Account';
import { useMyArtisan } from '../../store';

export default function ArtisanWorkspace() {
  const me = useMyArtisan();
  if (!me) return null;
  const approved = me.skills.filter((s) => s.status === 'approved').length;
  return (
    <Account>
      <Section title="My work">
        <ListItem icon="finger-print-outline" title="Verification & skills" subtitle={`${identityVerified(me.identity) ? 'Identity verified' : 'Identity not verified'} · ${approved} skill(s) verified`} onPress={() => router.push('/verify')} right={identityVerified(me.identity) ? <Pill label="Verified" tone="success" /> : <Pill label="Action needed" tone="warning" />} />
        <ListItem icon="create-outline" title="Edit public profile" subtitle="Bio, area and starting prices" onPress={() => router.push('/edit-profile')} />
        {me.accountType !== 'individual' ? <ListItem icon="people-outline" title={me.accountType === 'team' ? 'Team management' : 'Agency management'} subtitle={`${me.workers.filter((w) => w.active).length} active workers`} onPress={() => router.push('/team')} /> : null}
        <ListItem icon="stats-chart-outline" title="Performance insights" subtitle="Acceptance, completion, rating trends" onPress={() => router.push('/insights')} />
        <ListItem icon="calendar-outline" title="Payout settings" subtitle="Bank or wallet, payout schedule" onPress={() => router.push('/payout-settings')} />
        {me.accountType !== 'individual' ? <ListItem icon="business-outline" title="Business details" subtitle={me.business?.completedOnboarding ? 'CAC, service areas, team size' : 'Setup not finished'} onPress={() => router.push('/onboarding-business')} /> : null}
        <ListItem icon="card-outline" title="Payout account" subtitle={me.payoutAccount ? `${me.payoutAccount.bankName} ••${me.payoutAccount.accountNumberLast4}` : 'Not set'} onPress={() => router.push('/payout-account')} />
        <ListItem icon="cube-outline" title="Sleek Services" subtitle="Tools, materials & rentals at partner prices" onPress={() => router.push('/shop')} />
        <ListItem icon="receipt-outline" title="My orders" onPress={() => router.push('/orders')} />
        <ListItem icon="eye-outline" title="View my public profile" onPress={() => router.push({ pathname: '/artisan/[id]', params: { id: me.id } })} />
      </Section>
    </Account>
  );
}
