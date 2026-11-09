import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { confirmAction, JobStatusPill, showMessage } from '../../components/domain';
import { AutoReleaseCountdown, CoachTip, EscrowBadge } from '../../components/feedback';
import { JobTimeline, rebook, SafetyButton } from '../../components/jobParts';
import { Avatar, Banner, Button, Card, Chip, Divider, Field, Icon, KeyValue, Row, Screen, Section, Stars, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { freeWorkersFor } from '../../domain/availability';
import { customerBadge, customerScore } from '../../domain/customerRating';
import { canStart, isLocationDisclosed, quoteCancellation } from '../../domain/escrow';
import { canRequestExtension, EXTENSION_OPTIONS_MIN, pendingExtension } from '../../domain/extensions';
import { PROTECTION_DAYS, protectionCover, protectionEligible, protectionWindow } from '../../domain/protection';
import { canMarkEnRoute } from '../../domain/timeline';
import { canTip } from '../../domain/tips';
import type { Job } from '../../domain/types';
import { useT } from '../../i18n';
import { useJob, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { day, naira, time, windowLabel } from '../../utils/format';

export default function JobDetail() {
  const { c } = useTheme();
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const session = useStore((s) => s.session);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const customer = useStore((s) => s.customers.find((x) => x.id === job?.customerId));
  const jobs = useStore((s) => s.jobs);
  const actions = useStore(
    useShallow((s) => ({ startJob: s.startJob, cancelJob: s.cancelJob, declineJob: s.declineJob, assignWorker: s.assignWorker, markEnRoute: s.markEnRoute, requestExtension: s.requestExtension, decideExtension: s.decideExtension })),
  );
  const [reason, setReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [extMin, setExtMin] = useState(60);
  const [extReason, setExtReason] = useState('');
  const [showExt, setShowExt] = useState(false);

  const freeWorkers = useMemo(() => (job && artisan ? freeWorkersFor(jobs.filter((j) => j.id !== job.id), artisan, job.categoryId, job.window) : []), [jobs, job, artisan]);

  if (!job || !artisan || !customer) return <Screen title="Job">{<Txt>Not found.</Txt>}</Screen>;
  const party: 'customer' | 'artisan' = session.userId === job.customerId ? 'customer' : 'artisan';
  const now = Date.now();
  const disclosed = isLocationDisclosed(job);
  const worker = artisan.workers.find((w) => w.id === job.workerId);
  const quote = quoteCancellation(job, party, now);
  const isTeam = artisan.accountType !== 'individual' && artisan.workers.length > 0;
  const active = ['funded', 'in_progress', 'proof_submitted', 'disputed'].includes(job.status);
  const closed = ['completed', 'resolved', 'cancelled', 'declined'].includes(job.status);
  const pendingExt = pendingExtension(job);
  const prot = protectionEligible(job, artisan, category(job.categoryId), now);
  const protWin = protectionWindow(job);
  const custScore = customerScore(customer.customerStats);

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
    <Screen
      title={job.title}
      subtitle={`${category(job.categoryId).name} · Ref ${job.id.slice(-6).toUpperCase()}`}
      right={active && disclosed ? <SafetyButton job={job} compact /> : <JobStatusPill status={job.status} />}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <EscrowBadge job={job} />
        {active && disclosed ? <JobStatusPill status={job.status} /> : null}
      </Row>
      {prot.eligible && !['cancelled', 'declined'].includes(job.status) ? (
        <Row gap={6} style={{ marginTop: space.sm }}>
          <Icon name="ribbon-outline" size={14} color={c.primary} />
          <Txt v="small" color={c.primary} style={{ fontWeight: '700' }}>
            Sleek Protection · {PROTECTION_DAYS}-day guarantee up to {naira(protectionCover(job))}
          </Txt>
        </Row>
      ) : null}

      {/* Primary next action */}
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {job.status === 'proof_submitted' ? <AutoReleaseCountdown job={job} /> : null}
        {party === 'customer' && job.status === 'price_agreed' ? <Button title={`Pay ${naira(job.pricePool.locked!.amount)} into escrow`} icon="lock-closed" onPress={() => router.push({ pathname: '/escrow/[id]', params: { id: job.id } })} /> : null}
        {party === 'customer' && job.status === 'proof_submitted' ? <Button title="Review proof of work" icon="images-outline" onPress={() => router.push({ pathname: '/proof/[id]', params: { id: job.id } })} /> : null}
        {party === 'customer' && closed && job.status !== 'declined' && !job.reviewId && job.status !== 'cancelled' ? <Button title="Rate this job" icon="star-outline" onPress={() => router.push({ pathname: '/review/[id]', params: { id: job.id } })} /> : null}
        {party === 'artisan' && job.status === 'funded' && !job.enRouteAt ? (
          <Button variant={canMarkEnRoute(job, now) ? 'primary' : 'secondary'} title="I’m on my way" icon="navigate-outline" disabled={!canMarkEnRoute(job, now)} onPress={() => run(actions.markEnRoute(job.id))} />
        ) : null}
        {party === 'artisan' && job.status === 'funded' ? (
          <Button title={canStart(job, now) ? 'Start job now' : `Starts ${day(job.window.start)} ${time(job.window.start)}`} icon="play-outline" variant={job.enRouteAt || !canMarkEnRoute(job, now) ? 'primary' : 'ghost'} disabled={!canStart(job, now) || (isTeam && !job.workerId)} onPress={() => run(actions.startJob(job.id))} />
        ) : null}
        {party === 'artisan' && job.status === 'in_progress' ? <Button title="Upload proof of work" icon="cloud-upload-outline" onPress={() => router.push({ pathname: '/proof-upload/[id]', params: { id: job.id } })} /> : null}
        {party === 'artisan' && closed && job.status !== 'declined' && job.status !== 'cancelled' && !job.customerReviewId ? <Button variant="secondary" title="Rate this customer" icon="person-outline" onPress={() => router.push({ pathname: '/rate-customer/[id]', params: { id: job.id } })} /> : null}
        {job.status === 'disputed' || job.disputeId ? <Button variant="secondary" title="View dispute" icon="flag-outline" onPress={() => router.push({ pathname: '/dispute/[id]', params: { id: job.id } })} /> : null}
        <Button variant="ghost" title="Open chat" icon="chatbubbles-outline" onPress={() => router.push({ pathname: '/chat/[id]', params: { id: job.id } })} />
        {party === 'customer' && closed ? <Button variant="ghost" title={`Book ${artisan.businessName ?? artisan.name.split(' ')[0]} again`} icon="repeat-outline" onPress={() => rebook(job)} /> : null}
      </View>

      {/* More time: artisan asks, customer decides */}
      {pendingExt ? (
        <Card style={{ marginTop: space.md, borderColor: c.warning, borderWidth: 2 }}>
          <Row gap={6}>
            <Icon name="time-outline" color={c.warning} />
            <Txt v="bodyStrong">{party === 'customer' ? 'Your artisan needs more time' : 'Waiting for the customer'}</Txt>
          </Row>
          <Txt style={{ marginTop: 4 }}>
            +{pendingExt.extraMinutes} min — “{pendingExt.reason}”. New finish: {time(pendingExt.newEnd)}.
          </Txt>
          {party === 'customer' ? (
            <Row gap={space.sm} style={{ marginTop: space.md }}>
              <Button small full={false} variant="ghost" title="Decline" style={{ flex: 1 }} onPress={() => run(actions.decideExtension(job.id, false))} />
              <Button small full={false} title="Approve" icon="checkmark" style={{ flex: 1 }} onPress={() => run(actions.decideExtension(job.id, true))} />
            </Row>
          ) : null}
          <Txt v="tiny" muted style={{ marginTop: 6 }}>
            THE PRICE STAYS THE SAME. EXTRA WORK NEEDS A NEW AGREEMENT.
          </Txt>
        </Card>
      ) : party === 'artisan' && !canRequestExtension(job) ? (
        showExt ? (
          <Card style={{ marginTop: space.md }}>
            <Txt v="bodyStrong">Ask the customer for more time</Txt>
            <Row wrap gap={8} style={{ marginVertical: space.sm }}>
              {EXTENSION_OPTIONS_MIN.map((m) => (
                <Chip key={m} label={m < 60 ? `+${m} min` : `+${m / 60} hr`} selected={extMin === m} onPress={() => setExtMin(m)} />
              ))}
            </Row>
            <Field placeholder="Why do you need more time?" value={extReason} onChangeText={setExtReason} />
            <Button
              title="Send request"
              onPress={() => {
                const r = actions.requestExtension(job.id, extMin, extReason);
                if (!r.ok) return showMessage('Not sent', r.error);
                setShowExt(false);
                setExtReason('');
              }}
            />
          </Card>
        ) : (
          <View style={{ marginTop: space.sm }}>
            <Button variant="ghost" small title="Need more time?" icon="time-outline" onPress={() => setShowExt(true)} />
          </View>
        )
      ) : null}

      {/* Tip after release */}
      {party === 'customer' && !canTip(job) ? (
        <Card tone="soft" style={{ marginTop: space.md }} onPress={() => router.push({ pathname: '/tip/[id]', params: { id: job.id } })}>
          <Row gap={space.md}>
            <Icon name="gift-outline" color={c.primary} />
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">Add a tip (optional)</Txt>
              <Txt v="small" muted>
                100% goes to {artisan.name.split(' ')[0]}. Sleek takes nothing.
              </Txt>
            </View>
            <Icon name="chevron-forward" color={c.textMuted} />
          </Row>
        </Card>
      ) : job.tip ? (
        <Banner tone="success" icon="gift-outline" body={`${party === 'customer' ? 'You' : 'The customer'} tipped ${naira(job.tip.amount)}. Thank you!`} />
      ) : null}

      {/* Sleek Protection claim window */}
      {party === 'customer' && prot.eligible && protWin.open && new Date(protWin.until!).getTime() > now && !job.guaranteeClaimId ? (
        <Card style={{ marginTop: space.md }} onPress={() => router.push({ pathname: '/protection/[id]', params: { id: job.id } })}>
          <Row gap={space.md}>
            <Icon name="ribbon-outline" color={c.primary} />
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">Problem after approval?</Txt>
              <Txt v="small" muted>
                Claim under Sleek Protection until {day(protWin.until!)}.
              </Txt>
            </View>
            <Icon name="chevron-forward" color={c.textMuted} />
          </Row>
        </Card>
      ) : null}

      <Section title={t('timeline.title')}>
        <Card>
          <JobTimeline job={job} viewer={party} />
        </Card>
        <CoachTip id="tip_timeline" title="Everyone sees the same timeline" body="Each step is time-stamped. If there’s ever a disagreement, Sleek uses this record together with the chat and photos." />
      </Section>

      <Section title="Details">
        <Card>
          <KeyValue k="When" v={windowLabel(job.window)} />
          {party === 'customer' ? (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <Txt muted>Artisan</Txt>
              <Row gap={6}>
                <Avatar name={artisan.businessName ?? artisan.name} color={artisan.avatarColor} size={22} />
                <Txt>{artisan.businessName ?? artisan.name}</Txt>
              </Row>
            </Row>
          ) : (
            <View style={{ paddingVertical: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt muted>Customer</Txt>
                <Txt>{customer.name}</Txt>
              </Row>
              {custScore ? (
                <Row gap={6} style={{ justifyContent: 'flex-end', marginTop: 2 }}>
                  <Stars value={custScore.overall} size={12} />
                  <Txt v="small" muted>
                    {custScore.overall.toFixed(1)} from {custScore.count} artisans{customerBadge(customer.customerStats) ? ` · ${customerBadge(customer.customerStats)}` : ''}
                  </Txt>
                </Row>
              ) : (
                <Txt v="small" muted style={{ textAlign: 'right' }}>
                  New customer
                </Txt>
              )}
            </View>
          )}
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

      <Section title="Activity log">
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

      {quote.allowed && !closed ? (
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
      {active && !disclosed ? null : active ? (
        <Txt v="small" muted center style={{ marginTop: space.lg }}>
          Feel unsafe at any point? Tap the red Safety button at the top.
        </Txt>
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
