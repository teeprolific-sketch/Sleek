import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { confirmAction, JobStatusPill, showMessage } from '../../components/domain';
import { Avatar, Banner, Button, Card, Divider, Field, Icon, KeyValue, Row, Screen, Section, Steps, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { freeWorkersFor } from '../../domain/availability';
import { AUTO_RELEASE_HOURS, canStart, isLocationDisclosed, quoteCancellation } from '../../domain/escrow';
import type { Job } from '../../domain/types';
import { useShallow } from 'zustand/react/shallow';
import { useJob, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { countdown, day, naira, time, windowLabel } from '../../utils/format';

const STEP_INDEX: Record<Job['status'], number> = {
  requested: 0,
  price_agreed: 1,
  funded: 2,
  in_progress: 3,
  proof_submitted: 4,
  completed: 5,
  disputed: 4,
  resolved: 5,
  cancelled: 0,
  declined: 0,
};

export default function JobDetail() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const session = useStore((s) => s.session);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const customer = useStore((s) => s.customers.find((x) => x.id === job?.customerId));
  const jobs = useStore((s) => s.jobs);
  const actions = useStore(useShallow((s) => ({ startJob: s.startJob, cancelJob: s.cancelJob, declineJob: s.declineJob, assignWorker: s.assignWorker })));
  const [reason, setReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const freeWorkers = useMemo(() => (job && artisan ? freeWorkersFor(jobs.filter((j) => j.id !== job.id), artisan, job.categoryId, job.window) : []), [jobs, job, artisan]);

  if (!job || !artisan || !customer) return <Screen title="Job">{<Txt>Not found.</Txt>}</Screen>;
  const party: 'customer' | 'artisan' = session.userId === job.customerId ? 'customer' : 'artisan';
  const now = Date.now();
  const disclosed = isLocationDisclosed(job);
  const worker = artisan.workers.find((w) => w.id === job.workerId);
  const quote = quoteCancellation(job, party, now);
  const isTeam = artisan.accountType !== 'individual' && artisan.workers.length > 0;

  const run = (r: { ok: boolean; error?: string }) => {
    if (!r.ok) showMessage('Not possible', r.error);
  };
  const doCancel = () => {
    if (reason.trim().length < 4) return showMessage('Add a reason', 'Tell the other side briefly why you are cancelling.');
    confirmAction('Cancel this job?', quote.summary, 'Cancel job', () => {
      run(actions.cancelJob(job.id, reason.trim()));
      setShowCancel(false);
    }, true);
  };

  return (
    <Screen title={job.title} subtitle={`${category(job.categoryId).name} · Ref ${job.id.slice(-6).toUpperCase()}`} right={<JobStatusPill status={job.status} />}>
      {job.status === 'cancelled' || job.status === 'declined' ? (
        <Banner tone="neutral" title={job.status === 'cancelled' ? 'Cancelled' : 'Declined'} body={job.cancellation ? `By ${job.cancellation.by}: ${job.cancellation.reason}. Refund: ${naira(job.cancellation.refundAmount)}${job.cancellation.artisanCompensation ? `, artisan compensation ${naira(job.cancellation.artisanCompensation)}` : ''}.` : 'No payment was taken.'} />
      ) : (
        <Card>
          <Steps current={STEP_INDEX[job.status]} steps={['Request & chat', 'Price locked', 'Escrow funded', 'Work in progress', job.status === 'disputed' ? 'In dispute — Sleek reviewing' : 'Proof of work review', 'Payment released']} />
        </Card>
      )}

      {/* Primary next action */}
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {party === 'customer' && job.status === 'price_agreed' ? <Button title={`Pay ${naira(job.pricePool.locked!.amount)} into escrow`} icon="lock-closed" onPress={() => router.push({ pathname: '/escrow/[id]', params: { id: job.id } })} /> : null}
        {party === 'customer' && job.status === 'proof_submitted' ? <Button title="Review proof of work" icon="images-outline" onPress={() => router.push({ pathname: '/proof/[id]', params: { id: job.id } })} /> : null}
        {party === 'customer' && (job.status === 'completed' || job.status === 'resolved') && !job.reviewId ? <Button title="Rate this job" icon="star-outline" onPress={() => router.push({ pathname: '/review/[id]', params: { id: job.id } })} /> : null}
        {party === 'artisan' && job.status === 'funded' ? (
          <Button title={canStart(job, now) ? 'Start job now' : `Starts ${day(job.window.start)} ${time(job.window.start)}`} icon="play-outline" disabled={!canStart(job, now) || (isTeam && !job.workerId)} onPress={() => run(actions.startJob(job.id))} />
        ) : null}
        {party === 'artisan' && job.status === 'in_progress' ? <Button title="Upload proof of work" icon="cloud-upload-outline" onPress={() => router.push({ pathname: '/proof-upload/[id]', params: { id: job.id } })} /> : null}
        {job.status === 'disputed' || job.disputeId ? <Button variant="secondary" title="View dispute" icon="flag-outline" onPress={() => router.push({ pathname: '/dispute/[id]', params: { id: job.id } })} /> : null}
        <Button variant="ghost" title="Open chat" icon="chatbubbles-outline" onPress={() => router.push({ pathname: '/chat/[id]', params: { id: job.id } })} />
      </View>

      {party === 'artisan' && job.status === 'proof_submitted' && job.proof ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="warning" icon="hourglass-outline" title="Waiting for customer approval" body={`If the customer doesn’t respond, payment is auto-released in ${countdown(job.proof.autoReleaseAt, now)}.`} />
        </View>
      ) : null}
      {party === 'customer' && job.status === 'proof_submitted' && job.proof ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="warning" icon="hourglass-outline" body={`Approve or dispute within ${countdown(job.proof.autoReleaseAt, now)}. After that, payment is released automatically (${AUTO_RELEASE_HOURS[job.size]}h window for ${job.size} jobs).`} />
        </View>
      ) : null}

      <Section title="Details">
        <Card>
          <KeyValue k="When" v={windowLabel(job.window)} />
          <KeyValue k={party === 'customer' ? 'Artisan' : 'Customer'} v={party === 'customer' ? artisan.businessName ?? artisan.name : customer.name} />
          {worker ? <KeyValue k="Assigned worker" v={worker.name} /> : null}
          <KeyValue k="Price" v={job.pricePool.locked ? `${naira(job.pricePool.locked.amount)} (locked)` : 'Negotiating in chat'} />
          <KeyValue k="Escrow" v={escrowLabel(job)} />
          <Divider />
          <Txt v="small" muted>
            Location
          </Txt>
          {party === 'customer' || disclosed ? (
            <Row gap={6} style={{ marginTop: 4 }}>
              <Icon name="location" size={16} color={c.success} />
              <Txt style={{ flex: 1 }}>
                {job.address.line1}, {job.address.area}, {job.address.city}
                {job.address.landmark ? ` · ${job.address.landmark}` : ''}
              </Txt>
            </Row>
          ) : (
            <Row gap={6} style={{ marginTop: 4 }}>
              <Icon name="lock-closed" size={16} color={c.textMuted} />
              <Txt muted style={{ flex: 1 }}>
                {job.address.area}, {job.address.city} — the exact address unlocks when the customer funds escrow.
              </Txt>
            </Row>
          )}
          {job.description ? (
            <>
              <Divider />
              <Txt>{job.description}</Txt>
            </>
          ) : null}
          {job.issuePhotos.length ? (
            <ScrollView horizontal style={{ marginTop: space.md }} contentContainerStyle={{ gap: 8 }}>
              {job.issuePhotos.map((p) => (
                <Image key={p.id} source={{ uri: p.uri }} style={{ width: 80, height: 80, borderRadius: radius.sm }} />
              ))}
            </ScrollView>
          ) : null}
        </Card>
      </Section>

      {party === 'artisan' && isTeam && ['funded', 'price_agreed', 'requested'].includes(job.status) ? (
        <Section title="Assign a worker">
          <Txt v="small" muted style={{ marginBottom: space.sm }}>
            Only workers verified for {category(job.categoryId).name} and free at this time are shown.
          </Txt>
          {freeWorkers.length ? (
            freeWorkers.map((wid) => {
              const w = artisan.workers.find((x) => x.id === wid)!;
              const selected = job.workerId === wid;
              return (
                <Card key={wid} onPress={() => run(actions.assignWorker(job.id, wid))} style={{ marginBottom: space.sm, borderColor: selected ? c.primary : c.border, borderWidth: selected ? 2 : 1 }}>
                  <Row gap={space.md}>
                    <Avatar name={w.name} color={w.avatarColor} size={36} />
                    <Txt v="bodyStrong" style={{ flex: 1 }}>
                      {w.name}
                    </Txt>
                    {selected ? <Icon name="checkmark-circle" color={c.primary} /> : <Txt v="small" color={c.primary}>Assign</Txt>}
                  </Row>
                </Card>
              );
            })
          ) : (
            <Banner tone="warning" body="No verified worker is free for this window." />
          )}
        </Section>
      ) : null}

      {party === 'customer' && ['funded', 'in_progress'].includes(job.status) ? (
        <Section title="Need materials?">
          <Card onPress={() => router.push({ pathname: '/shop', params: { jobId: job.id, categoryId: job.categoryId } })}>
            <Row gap={space.md}>
              <Icon name="cube-outline" color={c.primary} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">Buy tools & materials for this job</Txt>
                <Txt v="small" muted>
                  Partner prices. Deliver to you or straight to your artisan.
                </Txt>
              </View>
              <Icon name="chevron-forward" color={c.textMuted} />
            </Row>
          </Card>
        </Section>
      ) : null}

      <Section title="Timeline">
        {[...job.timeline].reverse().map((e, i) => (
          <Row key={i} gap={space.md} style={{ paddingVertical: 6, alignItems: 'flex-start' }}>
            <Icon name={e.by === 'ugent' ? 'sparkles' : e.by === 'system' || e.by === 'admin' ? 'shield-checkmark-outline' : 'ellipse'} size={12} color={c.primary} style={{ marginTop: 4 }} />
            <View style={{ flex: 1 }}>
              <Txt>{e.label}</Txt>
              <Txt v="tiny" muted>
                {day(e.at)} {time(e.at)}
              </Txt>
            </View>
          </Row>
        ))}
      </Section>

      {quote.allowed && !['completed', 'resolved', 'cancelled', 'declined'].includes(job.status) ? (
        <Section title={party === 'artisan' && job.status === 'requested' ? 'Decline or cancel' : 'Cancel'}>
          {showCancel ? (
            <Card>
              <Txt v="small" muted style={{ marginBottom: space.sm }}>
                {quote.summary}
              </Txt>
              <Field placeholder="Reason" value={reason} onChangeText={setReason} />
              {party === 'artisan' && job.status === 'requested' ? (
                <Button variant="danger" title="Decline request" onPress={() => run(actions.declineJob(job.id, reason.trim() || 'Not available'))} />
              ) : (
                <Button variant="danger" title={quote.refundAmount ? `Cancel & refund ${naira(quote.refundAmount)}` : 'Cancel job'} onPress={doCancel} />
              )}
            </Card>
          ) : (
            <Button variant="ghost" title={party === 'artisan' && job.status === 'requested' ? 'Decline this request' : 'Cancel this job'} onPress={() => setShowCancel(true)} />
          )}
        </Section>
      ) : !quote.allowed && quote.reason && job.status === 'in_progress' ? (
        <Section title="Problem with the job?">
          <Txt v="small" muted style={{ marginBottom: space.sm }}>
            {quote.reason}
          </Txt>
          <Button variant="ghost" title="Open a dispute" icon="flag-outline" onPress={() => router.push({ pathname: '/dispute/[id]', params: { id: job.id } })} />
        </Section>
      ) : null}
    </Screen>
  );
}

function escrowLabel(job: Job): string {
  const e = job.escrow;
  switch (e.state) {
    case 'none':
      return 'Not funded';
    case 'held':
      return `${naira(e.amount)} held`;
    case 'frozen':
      return `${naira(e.amount)} frozen (dispute)`;
    case 'released':
      return `Released ${naira(e.releasedToArtisan ?? 0)} (fee ${naira(e.commission ?? 0)})`;
    case 'refunded':
      return `Refunded ${naira(e.refundedToCustomer ?? 0)}`;
    case 'partially_refunded':
      return `Refunded ${naira(e.refundedToCustomer ?? 0)} · paid ${naira(e.releasedToArtisan ?? 0)}`;
  }
}
