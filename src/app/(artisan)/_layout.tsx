import { Redirect } from 'expo-router';
import React from 'react';
import { ThemedTabs } from '../../components/tabs';
import { useT } from '../../i18n';
import { useStore } from '../../store';

export default function ArtisanTabs() {
  const t = useT();
  const role = useStore((s) => s.session.role);
  const requests = useStore((s) => s.jobs.filter((j) => j.artisanId === s.session.userId && j.status === 'requested').length);
  const active = useStore((s) => !!s.artisans.find((a) => a.id === s.session.userId)?.activatedAt);
  if (role !== 'artisan') return <Redirect href="/" />;
  if (!active) return <Redirect href="/verify" />;
  return (
    <ThemedTabs
      tabs={[
        { name: 'dashboard', title: t('tab.dashboard'), icon: 'grid' },
        { name: 'requests', title: t('tab.artisanJobs'), icon: 'briefcase', badge: requests },
        { name: 'schedule', title: t('tab.schedule'), icon: 'calendar' },
        { name: 'earnings', title: t('tab.earnings'), icon: 'wallet' },
        { name: 'workspace', title: t('tab.profile'), icon: 'person' },
      ]}
    />
  );
}
