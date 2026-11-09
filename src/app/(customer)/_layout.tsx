import { Redirect } from 'expo-router';
import React from 'react';
import { ThemedTabs } from '../../components/tabs';
import { useT } from '../../i18n';
import { useStore } from '../../store';

export default function CustomerTabs() {
  const t = useT();
  const role = useStore((s) => s.session.role);
  const pending = useStore((s) => s.jobs.filter((j) => j.customerId === s.session.userId && (j.status === 'proof_submitted' || j.status === 'price_agreed')).length);
  if (role !== 'customer') return <Redirect href="/" />;
  return (
    <ThemedTabs
      tabs={[
        { name: 'home', title: t('tab.home'), icon: 'home' },
        { name: 'jobs', title: t('tab.jobs'), icon: 'briefcase', badge: pending },
        { name: 'services', title: t('tab.services'), icon: 'cube' },
        { name: 'inbox', title: t('tab.chats'), icon: 'chatbubbles' },
        { name: 'profile', title: t('tab.profile'), icon: 'person' },
      ]}
    />
  );
}
