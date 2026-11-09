import { router } from 'expo-router';
import React from 'react';
import { ListItem, Section } from '../../components/ui';
import Account from '../../screens/Account';
import { useMyCustomer, useStore } from '../../store';

export default function CustomerProfile() {
  const me = useMyCustomer();
  const orders = useStore((s) => s.orders.filter((o) => o.userId === s.session.userId).length);
  return (
    <Account>
      <Section title="My Sleek">
        <ListItem icon="briefcase-outline" title="My jobs" onPress={() => router.push('/jobs')} />
        <ListItem icon="receipt-outline" title="Orders & deliveries" subtitle={orders ? `${orders} orders` : 'No orders yet'} onPress={() => router.push('/orders')} />
        <ListItem icon="location-outline" title="Saved addresses" subtitle={me?.addresses.map((a) => a.label).join(' · ')} onPress={() => router.push('/settings')} />
      </Section>
    </Account>
  );
}
