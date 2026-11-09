import { Redirect } from 'expo-router';
import React from 'react';
import { ThemedTabs } from '../../components/tabs';
import { useStore } from '../../store';

export default function ArtisanTabs() {
  const role = useStore((s) => s.session.role);
  const requests = useStore((s) => s.jobs.filter((j) => j.artisanId === s.session.userId && j.status === 'requested').length);
  if (role !== 'artisan') return <Redirect href="/" />;
  return (
    <ThemedTabs
      tabs={[
        { name: 'dashboard', title: 'Dashboard', icon: 'grid' },
        { name: 'requests', title: 'Jobs', icon: 'briefcase', badge: requests },
        { name: 'schedule', title: 'Schedule', icon: 'calendar' },
        { name: 'earnings', title: 'Earnings', icon: 'wallet' },
        { name: 'workspace', title: 'Profile', icon: 'person' },
      ]}
    />
  );
}
