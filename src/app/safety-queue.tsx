import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AdminNotes } from '../components/AdminNotes';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, Chip, EmptyState, Pill, Row, Screen, Section, Segmented, Txt } from '../components/ui';
import { protectionCover } from '../domain/protection';
import type { SafetyAlert } from '../domain/types';
import { useStore } from '../store';
import { space } from '../theme';
import { naira, relative } from '../utils/format';

const KIND_LABEL: Record<SafetyAlert['kind'], string> = { sos: 'SOS', unsafe: 'Feels unsafe', emergency_call: 'Called 112', shared_with_contact: 'Shared with contact' };

/** Admin: safety alerts (highest priority) and Sleek Protection claims. */
export default function SafetyQueue() {
  const role = useStore((s) => s.session.role);
  const alerts = useStore((s) => s.safetyAlerts);
  const claims = useStore((s) => s.guaranteeClaims);
  const jobs = useStore((s) => s.jobs);
  const customers = useStore((s) => s.customers);
  const artisans = useStore((s) => s.artisans);
  const update = useStore((s) => s.updateSafetyAlert);
  const decideClaim = useStore((s) => s.decideGuaranteeClaim);
  const [tab, setTab] = useState<'alerts' | 'claims'>('alerts');
  const [open, setOpen] = useState<string | null>(null);
  const sorted = useMemo(() => [...alerts].sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || Number(b.kind === 'sos') - Number(a.kind === 'sos') || b.at.localeCompare(a.at)), [alerts]);
  if (role !== 'admin') return <Screen title="Safety">{<Txt>Admins only.</Txt>}</Screen>;
  const name = (id: string) => customers.find((c) => c.id === id)?.name ?? artisans.find((a) => a.id === id)?.name ?? id;

  return (
    <Screen title="Safety & protection" subtitle={`${alerts.filter((a) => a.status === 'open').length} open alerts · ${claims.filter((c) => c.status === 'submitted').length} claims`}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'alerts', label: 'Safety alerts' }, { value: 'claims', label: 'Protection claims' }]} />
      <View style={{ marginTop: space.md }}>
        {tab === 'alerts' ? (
          sorted.length ? (
            sorted.map((a) => {
              const j = jobs.find((x) => x.id === a.jobId);
              return (
                <Card key={a.id} style={{ marginBottom: space.sm, borderWidth: a.kind === 'sos' && a.status === 'open' ? 2 : 1, borderColor: a.kind === 'sos' && a.status === 'open' ? '#DC2626' : undefined }} onPress={() => setOpen(open === a.id ? null : a.id)}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={6}>
                      <Pill label={KIND_LABEL[a.kind]} tone={a.kind === 'sos' || a.kind === 'emergency_call' ? 'danger' : 'warning'} />
                      <Txt v="bodyStrong">{name(a.userId)}</Txt>
                    </Row>
                    <Pill label={a.status} tone={a.status === 'resolved' ? 'success' : a.status === 'acknowledged' ? 'info' : 'danger'} />
                  </Row>
                  <Txt v="small" muted style={{ marginTop: 4 }}>
                    {a.role} · {relative(a.at)}
                    {j ? ` · ${j.title} (${j.address.area})` : ''}
                  </Txt>
                  {a.note ? <Txt style={{ marginTop: 4 }}>“{a.note}”</Txt> : null}
                  {open === a.id ? (
                    <View style={{ marginTop: space.md }}>
                      <Row gap={space.sm}>
                        {a.status === 'open' ? <Button small full={false} style={{ flex: 1 }} title="Acknowledge" onPress={() => update(a.id, 'acknowledged')} /> : null}
                        {a.status !== 'resolved' ? <Button small full={false} variant="ghost" style={{ flex: 1 }} title="Resolve" onPress={() => update(a.id, 'resolved')} /> : null}
                        {j ? <Button small full={false} variant="ghost" style={{ flex: 1 }} title="Open job" onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })} /> : null}
                      </Row>
                      <AdminNotes targetType="safety" targetId={a.id} />
                    </View>
                  ) : null}
                </Card>
              );
            })
          ) : (
            <EmptyState icon="shield-checkmark-outline" title="No safety alerts" body="SOS, “I feel unsafe” and 112 calls from the app appear here, newest and most urgent first." />
          )
        ) : claims.length ? (
          claims.map((cl) => {
            const j = jobs.find((x) => x.id === cl.jobId);
            return (
              <Card key={cl.id} style={{ marginBottom: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="bodyStrong" style={{ flex: 1 }}>
                    {j?.title}
                  </Txt>
                  <Pill label={cl.status} tone={cl.status === 'approved' ? 'success' : cl.status === 'declined' ? 'neutral' : 'warning'} />
                </Row>
                <Txt v="small" muted>
                  {name(cl.customerId)} · {relative(cl.at)} · cover up to {j ? naira(protectionCover(j)) : '—'}
                </Txt>
                <Txt style={{ marginTop: 4 }}>{cl.details}</Txt>
                {cl.status === 'submitted' && j ? (
                  <Row wrap gap={8} style={{ marginTop: space.sm }}>
                    {[0.25, 0.5, 1].map((f) => (
                      <Chip key={f} label={`Pay ${naira(Math.round(protectionCover(j) * f))}`} onPress={() => { const r = decideClaim(cl.id, true, protectionCover(j) * f); if (!r.ok) showMessage('Error', r.error); }} />
                    ))}
                    <Chip label="Decline" onPress={() => decideClaim(cl.id, false, 0)} />
                  </Row>
                ) : null}
              </Card>
            );
          })
        ) : (
          <EmptyState icon="ribbon-outline" title="No protection claims" body="Claims made within 7 days of an approved, protected job appear here." />
        )}
      </View>
      <Section title="Escalation">
        <Banner tone="danger" body="SOS with an exact address and no response in 10 minutes: call the user via the support line and, if needed, the nearest police division. Log every step as a note." />
      </Section>
    </Screen>
  );
}
