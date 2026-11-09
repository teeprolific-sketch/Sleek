import { router } from 'expo-router';
import React from 'react';
import { Card, EmptyState, Pill, Row, Screen, Txt } from '../../components/ui';
import { DISPUTE_REASONS } from '../../data/disputes';
import { useStore } from '../../store';
import { space } from '../../theme';
import { naira, relative } from '../../utils/format';

export default function DisputeQueue() {
  const disputes = useStore((s) => s.disputes);
  const jobs = useStore((s) => s.jobs);
  return (
    <Screen title="Disputes" back={false}>
      {disputes.length ? (
        disputes.map((d) => {
          const j = jobs.find((x) => x.id === d.jobId);
          return (
            <Card key={d.id} style={{ marginBottom: space.sm }} onPress={() => router.push({ pathname: '/resolve/[id]', params: { id: d.id } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {j?.title}
                </Txt>
                <Pill label={d.status.replace('_', ' ')} tone={d.status === 'resolved' ? 'success' : d.status === 'open' ? 'danger' : 'warning'} />
              </Row>
              <Txt v="small" muted>
                {DISPUTE_REASONS.find((r) => r.id === d.reason)?.label} · by {d.openedBy} · {relative(d.openedAt)} · {naira(j?.escrow.amount ?? 0)}
              </Txt>
            </Card>
          );
        })
      ) : (
        <EmptyState icon="flag-outline" title="No disputes" body="When a customer or artisan disputes a job, the escrow is frozen and the case lands here." />
      )}
    </Screen>
  );
}
