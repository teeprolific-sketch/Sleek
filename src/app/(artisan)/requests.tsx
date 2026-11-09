import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { JobCard } from '../../components/domain';
import { EmptyState, IconButton, Screen, Segmented, Spacer } from '../../components/ui';
import { useStore } from '../../store';

type Tab = 'requests' | 'active' | 'past';

export default function ArtisanJobs() {
  const jobs = useStore((s) => s.jobs);
  const customers = useStore((s) => s.customers);
  const userId = useStore((s) => s.session.userId);
  const [tab, setTab] = useState<Tab>('requests');
  const list = useMemo(() => {
    const mine = jobs.filter((j) => j.artisanId === userId);
    if (tab === 'requests') return mine.filter((j) => j.status === 'requested' || j.status === 'price_agreed');
    if (tab === 'active') return mine.filter((j) => ['funded', 'in_progress', 'proof_submitted', 'disputed'].includes(j.status)).sort((a, b) => a.window.start.localeCompare(b.window.start));
    return mine.filter((j) => ['completed', 'resolved', 'cancelled', 'declined'].includes(j.status));
  }, [jobs, userId, tab]);

  const header = (
    <Segmented
      value={tab}
      onChange={setTab}
      options={[
        { value: 'requests', label: 'Requests' },
        { value: 'active', label: 'Active' },
        { value: 'past', label: 'Past' },
      ]}
    />
  );
  return (
    <Screen title="Jobs" back={false} right={<IconButton icon="chatbubbles-outline" label="All chats" onPress={() => router.push('/chats')} />}>
      {header}
      <Spacer />
      {list.length ? (
        list.map((j) => (
          <JobCard
            key={j.id}
            job={j}
            counterpartName={customers.find((c) => c.id === j.customerId)?.name}
            onPress={() => router.push({ pathname: tab === 'requests' ? '/chat/[id]' : '/job/[id]', params: { id: j.id } })}
          />
        ))
      ) : (
        <EmptyState
          icon="briefcase-outline"
          title={tab === 'requests' ? 'No new requests' : tab === 'active' ? 'No active jobs' : 'No past jobs'}
          body={tab === 'requests' ? 'Requests from customers appear here. Reply quickly and agree a fair price in the Price Pool.' : 'Funded jobs, work in progress and jobs awaiting approval appear here.'}
        />
      )}
    </Screen>
  );
}
