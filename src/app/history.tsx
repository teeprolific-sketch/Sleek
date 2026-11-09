import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { JobCard } from '../components/domain';
import { rebook } from '../components/jobParts';
import { Button, Card, Chip, EmptyState, KeyValue, Row, Screen, Spacer } from '../components/ui';
import { useT } from '../i18n';
import { useStore } from '../store';
import { space } from '../theme';
import { naira } from '../utils/format';

type Filter = 'all' | 'completed' | 'cancelled' | 'disputed';

/** Full job history for customers and artisans, with filters. */
export default function History() {
  const t = useT();
  const jobs = useStore((s) => s.jobs);
  const session = useStore((s) => s.session);
  const artisans = useStore((s) => s.artisans);
  const customers = useStore((s) => s.customers);
  const [filter, setFilter] = useState<Filter>('all');
  const isCustomer = session.role === 'customer';

  const closed = useMemo(
    () =>
      jobs
        .filter((j) => (isCustomer ? j.customerId : j.artisanId) === session.userId)
        .filter((j) => ['completed', 'resolved', 'cancelled', 'declined', 'disputed'].includes(j.status))
        .sort((a, b) => b.window.start.localeCompare(a.window.start)),
    [jobs, session.userId, isCustomer],
  );
  const list = closed.filter((j) =>
    filter === 'all' ? true : filter === 'completed' ? j.status === 'completed' : filter === 'cancelled' ? j.status === 'cancelled' || j.status === 'declined' : !!j.disputeId,
  );
  const count = (f: Filter) => closed.filter((j) => (f === 'completed' ? j.status === 'completed' : f === 'cancelled' ? j.status === 'cancelled' || j.status === 'declined' : f === 'disputed' ? !!j.disputeId : true)).length;
  const total = closed.filter((j) => j.status === 'completed').reduce((s, j) => s + (isCustomer ? j.escrow.amount : j.escrow.releasedToArtisan ?? 0), 0);

  return (
    <Screen title="Job history">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(['all', 'completed', 'cancelled', 'disputed'] as Filter[]).map((f) => (
          <Chip key={f} label={`${f[0].toUpperCase()}${f.slice(1)} (${count(f)})`} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>
      <Spacer />
      {closed.length ? (
        <Card tone="soft" style={{ marginBottom: space.md }}>
          <KeyValue k={isCustomer ? 'Spent on completed jobs' : 'Earned from completed jobs'} v={naira(total)} strong />
          <KeyValue k="Jobs completed" v={String(count('completed'))} />
        </Card>
      ) : null}
      {list.length ? (
        list.map((j) => (
          <React.Fragment key={j.id}>
            <JobCard job={j} artisan={artisans.find((a) => a.id === j.artisanId)} counterpartName={isCustomer ? undefined : customers.find((c) => c.id === j.customerId)?.name} />
            {isCustomer && j.status === 'completed' ? (
              <Row style={{ marginTop: -space.sm, marginBottom: space.md, justifyContent: 'flex-end' }}>
                <Button small full={false} variant="ghost" icon="repeat-outline" title="Book again" onPress={() => rebook(j)} />
              </Row>
            ) : null}
          </React.Fragment>
        ))
      ) : (
        <EmptyState icon="time-outline" title={t('empty.history')} body={t('empty.historyBody')} action={isCustomer ? 'Find an artisan' : undefined} onAction={() => router.push('/search')} />
      )}
    </Screen>
  );
}
