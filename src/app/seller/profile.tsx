import { router } from 'expo-router';
import React from 'react';
import { ListItem, Section } from '../../components/ui';
import Account from '../../screens/Account';
import { useMySeller } from '../../store';

export default function SellerProfile() {
  const me = useMySeller();
  if (!me) return null;
  return (
    <Account>
      <Section title="Your store">
        <ListItem icon="storefront-outline" title="Store dashboard" subtitle={me.storeLive ? 'Live on Sleek Services' : 'Not live yet'} onPress={() => router.replace('/seller')} />
        <ListItem icon="id-card-outline" title="Verification" subtitle={me.identity.faceMatch === 'passed' ? `Verified · NIN ending ${me.identity.ninLast4}` : 'Not verified'} onPress={() => router.push('/verify')} />
        <ListItem icon="card-outline" title="Payout account" subtitle={me.payoutAccount ? `${me.payoutAccount.bankName} ••${me.payoutAccount.accountNumberLast4}` : 'Not set'} onPress={() => router.push('/payout-account')} />
        <ListItem icon="mail-outline" title="Email" subtitle={me.email} />
      </Section>
    </Account>
  );
}
