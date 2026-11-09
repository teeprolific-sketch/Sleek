import { Redirect } from 'expo-router';
import React from 'react';
import { ThemedTabs } from '../../components/tabs';
import { useStore } from '../../store';

export default function AdminTabs() {
  const role = useStore((s) => s.session.role);
  const openDisputes = useStore((s) => s.disputes.filter((d) => d.status !== 'resolved').length);
  const unreviewed = useStore((s) => s.violations.filter((v) => !v.reviewed).length);
  if (role !== 'admin') return <Redirect href="/" />;
  return (
    <ThemedTabs
      tabs={[
        { name: 'index', title: 'Overview', icon: 'analytics' },
        { name: 'verifications', title: 'Verify', icon: 'finger-print' },
        { name: 'disputes', title: 'Disputes', icon: 'flag', badge: openDisputes },
        { name: 'violations', title: 'Rules', icon: 'ban', badge: unreviewed },
        { name: 'account', title: 'Account', icon: 'person' },
      ]}
    />
  );
}
