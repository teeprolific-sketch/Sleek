import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { JobCard } from '../../components/domain';
import { EmptyState, IconButton, Screen, Segmented, Spacer } from '../../components/ui';
import { useStore } from '../../store';

type Tab = 'active' | 'upcoming' | 'past';

export default function CustomerJobs() {
  const jobs = useStore((s) => s.jobs);
  const userId = useStore((s) => s.session.userId);
  const artisans = useStore((s) => s.artisans);
  const [tab, setTab] = useState<Tab>('active');

  const list = useMemo(() => {
    const mine = jobs.filter((j) => j.customerId === userId);
    if (tab === 'active') return mine.filter((j) => ['requested', 'price_agreed', 'in_progress', 'proof_submitted', 'disputed'].includes(j.status));
    if (tab === 'upcoming') return mine.filter((j) => j.status === 'funded').sort((a, b) => a.window.start.localeCompare(b.window.start));
    return mine.filter((j) => ['completed', 'resolved', 'cancelled', 'declined'].includes(j.status));
  }, [jobs, userId, tab]);

  return (
    <Screen title="My jobs" back={false} right={<IconButton icon="time-outline" label="Job history" onPress={() => router.push('/history')} />}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
      <Spacer />
      {list.length ? (
        list.map((j) => <JobCard key={j.id} job={j} artisan={artisans.find((a) => a.id === j.artisanId)} />)
      ) : (
        <EmptyState
          icon="briefcase-outline"
          title={tab === 'past' ? 'No past jobs yet' : tab === 'upcoming' ? 'Nothing scheduled' : 'No active jobs'}
          body={tab === 'upcoming' ? 'Jobs appear here once you’ve paid into Sleek Hold and they’re waiting for their date.' : 'Find a verified artisan, agree a price in chat, and pay safely with Sleek Hold.'}
          action="Find an artisan"
          onAction={() => router.push('/search')}
        />
      )}
    </Screen>
  );
}
