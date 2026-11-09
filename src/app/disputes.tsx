import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Banner, Card, EmptyState, Icon, Pill, Row, Screen, Section, Segmented, Steps, Txt } from '../components/ui';
import { DISPUTE_REASONS } from '../data/disputes';
import { canDispute } from '../domain/escrow';
import { useT } from '../i18n';
import { useStore } from '../store';
import { space, useTheme } from '../theme';
import { day, naira } from '../utils/format';

/** Dispute Centre: one calm place to open, follow and read decisions on disputes. */
export default function DisputeCentre() {
  const { c } = useTheme();
  const t = useT();
  const disputes = useStore((s) => s.disputes);
  const jobs = useStore((s) => s.jobs);
  const session = useStore((s) => s.session);
  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const mineJobs = useMemo(() => jobs.filter((j) => j.customerId === session.userId || j.artisanId === session.userId), [jobs, session.userId]);
  const mine = useMemo(() => disputes.filter((d) => mineJobs.some((j) => j.id === d.jobId)), [disputes, mineJobs]);
  const list = mine.filter((d) => (tab === 'active' ? d.status !== 'resolved' : d.status === 'resolved'));
  const eligible = mineJobs.filter((j) => canDispute(j));

  return (
    <Screen title={t('dispute.centre')}>
      <Banner tone="primary" icon="shield-checkmark-outline" body={t('dispute.intro')} />
      <Section title={t('dispute.howItWorks')}>
        <Card>
          <Steps current={-1} steps={[t('dispute.step1'), t('dispute.step2'), t('dispute.step3'), t('dispute.step4')]} />
        </Card>
      </Section>

      <Section title={t('dispute.open')}>
        {eligible.length ? (
          eligible.map((j) => (
            <Card key={j.id} style={{ marginBottom: space.sm }} onPress={() => router.push({ pathname: '/dispute/[id]', params: { id: j.id } })}>
              <Row gap={space.md}>
                <Icon name="flag-outline" color={c.danger} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{j.title}</Txt>
                  <Txt v="small" muted>
                    {naira(j.escrow.amount)} held in escrow · {day(j.window.start)}
                  </Txt>
                </View>
                <Icon name="chevron-forward" color={c.textMuted} />
              </Row>
            </Card>
          ))
        ) : (
          <Txt v="small" muted>
            You can open a dispute on any job where money is held in escrow (booked, in progress, or awaiting approval). For problems after approval, use Sleek Protection on the job page.
          </Txt>
        )}
      </Section>

      <Section title="Your disputes">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: `${t('dispute.active')} (${mine.filter((d) => d.status !== 'resolved').length})` }, { value: 'closed', label: `${t('dispute.closed')} (${mine.filter((d) => d.status === 'resolved').length})` }]} />
        <View style={{ marginTop: space.md }}>
          {list.length ? (
            list.map((d) => {
              const j = jobs.find((x) => x.id === d.jobId);
              return (
                <Card key={d.id} style={{ marginBottom: space.sm }} onPress={() => router.push({ pathname: '/dispute/[id]', params: { id: d.jobId } })}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {j?.title}
                    </Txt>
                    <Pill label={d.status === 'open' ? 'Waiting for review' : d.status === 'under_review' ? 'Being reviewed' : 'Decided'} tone={d.status === 'resolved' ? 'success' : 'warning'} />
                  </Row>
                  <Txt v="small" muted>
                    {DISPUTE_REASONS.find((r) => r.id === d.reason)?.label} · opened {day(d.openedAt)} · {naira(j?.escrow.amount ?? 0)}
                  </Txt>
                  {d.resolution ? (
                    <Txt v="small" style={{ marginTop: 6 }} numberOfLines={2}>
                      Decision: {d.resolution.note}
                    </Txt>
                  ) : null}
                </Card>
              );
            })
          ) : (
            <EmptyState icon="happy-outline" title={t('dispute.none')} body={t('dispute.noneBody')} />
          )}
        </View>
      </Section>
    </Screen>
  );
}
