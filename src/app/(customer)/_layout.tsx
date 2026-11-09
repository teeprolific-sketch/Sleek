import { Redirect } from 'expo-router';
import React from 'react';
import { ThemedTabs } from '../../components/tabs';
import { useStore } from '../../store';

export default function CustomerTabs() {
  const role = useStore((s) => s.session.role);
  const pending = useStore((s) => s.jobs.filter((j) => j.customerId === s.session.userId && (j.status === 'proof_submitted' || j.status === 'price_agreed')).length);
  if (role !== 'customer') return <Redirect href="/" />;
  return (
    <ThemedTabs
      tabs={[
        { name: 'home', title: 'Home', icon: 'home' },
        { name: 'jobs', title: 'My Jobs', icon: 'briefcase', badge: pending },
        { name: 'services', title: 'Services', icon: 'cube' },
        { name: 'inbox', title: 'Chats', icon: 'chatbubbles' },
        { name: 'profile', title: 'Profile', icon: 'person' },
      ]}
    />
  );
}
