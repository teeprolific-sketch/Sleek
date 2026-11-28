import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirmAction, JobStatusPill, showMessage } from '../../components/domain';
import { AutoReleaseCountdown, EscrowBadge, NetworkBanner } from '../../components/feedback';
import { SafetyButton } from '../../components/jobParts';
import { useT } from '../../i18n';
import { Banner, Button, Chip, Field, Icon, Row, Txt, toneColors } from '../../components/ui';
import { category } from '../../data/categories';
import { isLocationDisclosed } from '../../domain/escrow';
import { moderateMessage } from '../../domain/moderation';
import { canAccept, latestPending, validateAmount } from '../../domain/pricePool';
import { FEE_LABEL, feeEditable, feePaid } from '../../domain/fees';
import type { FeeType } from '../../domain/types';
import type { ChatMessage, Job } from '../../domain/types';
import { useJob, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { requestCapture } from '../../utils/captureBus';
import { naira, time, windowLabel } from '../../utils/format';

export default function Chat() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const allMessages = useStore((s) => s.messages);
  const session = useStore((s) => s.session);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const customer = useStore((s) => s.customers.find((x) => x.id === job?.customerId));
  const sendMessage = useStore((s) => s.sendMessage);
  const addIssuePhoto = useStore((s) => s.addIssuePhoto);
  const logCapture = useStore((s) => s.logCapture);
  const t = useT();
  const outboxAll = useStore((s) => s.outbox);
  const [text, setText] = useState('');
  const [blocked, setBlocked] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const messages = useMemo(
    () => [
      ...allMessages.filter((m) => m.jobId === id),
      ...outboxAll.filter((m) => m.jobId === id).map((m): ChatMessage & { queued?: boolean } => ({ id: m.id, jobId: m.jobId, from: m.from, kind: 'text', text: m.text, at: m.at, queued: true })),
    ],
    [allMessages, outboxAll, id],
  );
  const recentTextsBy = useStore((s) => s.recentTextsBy);
  const myParty = session.userId === job?.customerId ? 'customer' : 'artisan';
  const live = useMemo(() => (text.trim() ? moderateMessage(text, { recent: recentTextsBy(id, myParty) }) : null), [text, recentTextsBy, id, myParty]);
  const sendBlocked = !!live && !live.allowed;

  if (!job || !artisan || !customer) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: space.lg }}>
        <Txt>Chat not found.</Txt>
      </SafeAreaView>
    );
  }
  const party: 'customer' | 'artisan' = session.userId === job.customerId ? 'customer' : 'artisan';
  const other = party === 'customer' ? artisan.businessName ?? artisan.name : customer.name;
  const closed = ['completed', 'resolved', 'cancelled', 'declined'].includes(job.status);
  const disclosed = isLocationDisclosed(job);

  const send = () => {
    const res = sendMessage(job.id, text);
    if (!res.allowed) {
      if (res.warning) setBlocked(res.warning);
      return;
    }
    setBlocked(null);
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const guidedUpload = () => {
    const purpose = party === 'customer' ? 'issue_photo' : 'site_before';
    requestCapture(purpose, (uri) => {
      const m = logCapture(purpose, uri, job.id);
      const r = addIssuePhoto(job.id, m);
      if (!r.ok) showMessage('Upload not allowed', r.error);
    }, job.id);
  };
  const canGuidedUpload = !closed && (party === 'customer' ? ['requested', 'price_agreed', 'funded'].includes(job.status) : ['funded', 'in_progress'].includes(job.status));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <Row style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: c.border }} gap={space.sm}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Icon name="chevron-back" size={24} />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}>
          <Txt v="h3" numberOfLines={1}>
            {other}
          </Txt>
          <Txt v="small" muted numberOfLines={1}>
            {job.title} · {category(job.categoryId).name}
          </Txt>
        </Pressable>
        {['funded', 'in_progress', 'proof_submitted', 'disputed'].includes(job.status) && disclosed ? <SafetyButton job={job} compact /> : <JobStatusPill status={job.status} />}
      </Row>
      <NetworkBanner />

      {/* Job strip */}
      <Row style={{ paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: c.surface }} gap={space.md}>
        <Row gap={4} style={{ flex: 1 }}>
          <Icon name="time-outline" size={14} color={c.textMuted} />
          <Txt v="small" muted numberOfLines={1}>
            {windowLabel(job.window)}
          </Txt>
        </Row>
        <Row gap={4}>
          <Icon name={disclosed ? 'location' : 'lock-closed'} size={14} color={disclosed ? c.success : c.textMuted} />
          <Txt v="small" muted numberOfLines={1}>
            {disclosed || party === 'customer' ? job.address.area : `${job.address.area} (exact address after Sleek Hold)`}
          </Txt>
        </Row>
      </Row>
      <Row style={{ paddingHorizontal: space.md, paddingTop: space.sm, justifyContent: 'space-between' }}>
        <EscrowBadge job={job} compact />
        <AutoReleaseCountdown job={job} compact />
      </Row>

      <FeePanel job={job} party={party} />
      {feePaid(job) ? <PricePoolPanel job={job} party={party} /> : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => <Bubble m={item} mine={item.from === party} job={job} queuedLabel={(item as { queued?: boolean }).queued ? t('chat.queued') : undefined} />}
          initialNumToRender={20}
          windowSize={7}
        />

        {blocked ? (
          <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
            <Banner tone="danger" icon="ban-outline" title={t('chat.blocked')} body={blocked} action={t('chat.rules')} onAction={() => router.push('/trust-safety')} />
          </View>
        ) : live && !live.allowed ? (
          <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
            <Banner tone="warning" icon="warning-outline" body={t('chat.looksLikeContact')} />
          </View>
        ) : null}

        {closed ? (
          <View style={{ padding: space.md, borderTopWidth: 1, borderTopColor: c.border }}>
            <Txt v="small" muted center>
              This job is closed. The chat is kept as a permanent record.
            </Txt>
          </View>
        ) : (
          <Row style={{ padding: space.sm, borderTopWidth: 1, borderTopColor: c.border, alignItems: 'flex-end' }} gap={space.sm}>
            {canGuidedUpload ? (
              <Pressable
                onPress={guidedUpload}
                accessibilityRole="button"
                accessibilityLabel={party === 'customer' ? 'Upload photo of the issue' : 'Photo before starting'}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="camera-outline" color={c.primary} />
              </Pressable>
            ) : null}
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (blocked) setBlocked(null);
              }}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={c.textMuted}
              multiline
              maxLength={1000}
              style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: space.md, paddingTop: 12, paddingBottom: 10, backgroundColor: c.surface, color: c.text, fontSize: 16 }}
            />
            <Pressable
              onPress={send}
              disabled={!text.trim() || sendBlocked}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !text.trim() || sendBlocked }}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() && !sendBlocked ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="send" color={text.trim() && !sendBlocked ? c.primaryText : c.textMuted} size={18} />
            </Pressable>
          </Row>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m, mine, job, queuedLabel }: { m: ChatMessage; mine: boolean; job: Job; queuedLabel?: string }) {
  const { c } = useTheme();
  if (m.kind === 'system') {
    return (
      <View style={{ alignSelf: 'center', maxWidth: '92%', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.sm, flexDirection: 'row', gap: 6 }}>
        <Icon name="shield-checkmark-outline" size={14} color={c.primary} style={{ marginTop: 2 }} />
        <Txt v="small" style={{ flexShrink: 1 }}>
          {m.text}
        </Txt>
      </View>
    );
  }
  if (m.kind === 'price') {
    const offer = job.pricePool.offers.find((o) => o.id === m.offerId);
    const tone = offer?.status === 'accepted' ? 'success' : offer?.status === 'pending' ? 'warning' : 'neutral';
    const t = toneColors(c, tone);
    return (
      <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', borderWidth: 1, borderColor: t.fg, backgroundColor: t.bg, borderRadius: radius.md, padding: space.md, minWidth: 180 }}>
        <Row gap={6}>
          <Icon name="pricetag-outline" size={16} color={t.fg} />
          <Txt v="tiny" color={t.fg}>
            {m.text.startsWith('Counter') ? 'COUNTER-OFFER' : 'PRICE OFFER'} · {(offer?.status ?? '').toUpperCase()}
          </Txt>
        </Row>
        <Txt v="h2" style={{ marginTop: 4 }}>
          {offer ? naira(offer.amount) : m.text}
        </Txt>
        {offer?.note ? (
          <Txt v="small" muted>
            {offer.note}
          </Txt>
        ) : null}
        <Txt v="tiny" muted style={{ marginTop: 4 }}>
          {mine ? 'You' : m.from === 'customer' ? 'Customer' : 'Artisan'} · {time(m.at)}
        </Txt>
      </View>
    );
  }
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      <View style={{ backgroundColor: mine ? c.primary : c.surface, borderRadius: 18, borderBottomRightRadius: mine ? 4 : 18, borderBottomLeftRadius: mine ? 18 : 4, padding: m.media ? 4 : 12 }}>
        {m.media ? (
          <View>
            <Image source={{ uri: m.media.uri }} style={{ width: 200, height: 200, borderRadius: 14 }} />
            <Row gap={4} style={{ padding: 6 }}>
              <Icon name="camera-outline" size={12} color={mine ? c.primaryText : c.textMuted} />
              <Txt v="tiny" color={mine ? c.primaryText : c.textMuted}>
                {m.text.toUpperCase()} · LOGGED
              </Txt>
            </Row>
          </View>
        ) : (
          <Txt color={mine ? c.primaryText : c.text}>{m.text}</Txt>
        )}
      </View>
      <Txt v="tiny" muted style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 2 }}>
        {queuedLabel ? `⏳ ${queuedLabel}` : time(m.at)}
      </Txt>
    </View>
  );
}

/** Upfront fee: the customer pays it before the artisan engages; the artisan can change it until it's paid. */
function FeePanel({ job, party }: { job: Job; party: 'customer' | 'artisan' }) {
  const { c } = useTheme();
  const setJobFee = useStore((s) => s.setJobFee);
  const [edit, setEdit] = useState(false);
  const [type, setType] = useState<FeeType>(job.fee?.type ?? 'booking');
  const [amount, setAmount] = useState(String(job.fee?.amount ?? ''));
  const [error, setError] = useState<string | null>(null);
  if (!job.fee || job.status === 'cancelled' || job.status === 'declined') return null;
  const f = job.fee;
  const label = FEE_LABEL[f.type];
  if (f.status !== 'unpaid') {
    return (
      <View style={{ marginHorizontal: space.md, marginTop: space.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={f.status === 'refunded' ? 'return-down-back-outline' : 'checkmark-circle'} size={14} color={f.status === 'refunded' ? c.textMuted : c.success} />
        <Txt v="tiny" muted>
          {label} {naira(f.amount)} · {f.status === 'held' ? (f.type === 'inspection' ? 'in Sleek Hold until the inspection is done' : 'in Sleek Hold until the artisan sends a price') : f.status === 'released' ? 'released to the artisan' : 'refunded'}
        </Txt>
      </View>
    );
  }
  const save = () => {
    const r = setJobFee(job.id, { type, amount: Number(amount.replace(/\D/g, '')) });
    if (!r.ok) return setError(r.error);
    setError(null);
    setEdit(false);
  };
  return (
    <View style={{ margin: space.md, marginBottom: 0, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.warning, backgroundColor: c.card, gap: space.sm }}>
      <Row gap={6}>
        <Icon name="cash-outline" size={16} color={c.warning} />
        <Txt v="bodyStrong" style={{ flex: 1 }}>
          {label}: {naira(f.amount)}
        </Txt>
      </Row>
      <Txt v="small" muted>
        {party === 'customer' ? 'Pay this first. It waits in Sleek Hold, then chat and price talks open. You get it back if the artisan declines or doesn’t reply in 24 hours.' : 'Chat opens when the customer pays this fee. You can change the type or amount until they pay.'}
      </Txt>
      {party === 'customer' ? (
        <Button small title={`Pay ${naira(f.amount)}`} icon="lock-closed" onPress={() => router.push({ pathname: '/fee/[id]', params: { id: job.id } })} />
      ) : feeEditable(job) ? (
        edit ? (
          <View style={{ gap: space.sm }}>
            <Row wrap gap={8}>
              {(['booking', 'consultancy', 'inspection'] as FeeType[]).map((t) => (
                <Chip key={t} label={FEE_LABEL[t]} selected={type === t} onPress={() => setType(t)} />
              ))}
            </Row>
            <Field placeholder="Amount in ₦" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" error={error} />
            <Row gap={space.sm}>
              <Button small full={false} variant="ghost" title="Cancel" style={{ flex: 1 }} onPress={() => setEdit(false)} />
              <Button small full={false} title="Save fee" style={{ flex: 1 }} onPress={save} />
            </Row>
          </View>
        ) : (
          <Button small variant="secondary" title="Change fee for this job" icon="create-outline" onPress={() => setEdit(true)} />
        )
      ) : null}
    </View>
  );
}

/** The in-chat Price Pool / Price Agreement component. */
function PricePoolPanel({ job, party }: { job: Job; party: 'customer' | 'artisan' }) {
  const { c } = useTheme();
  const proposePrice = useStore((s) => s.proposePrice);
  const acceptPrice = useStore((s) => s.acceptPrice);
  const withdrawOffer = useStore((s) => s.withdrawOffer);
  const [open, setOpen] = useState(job.status === 'requested');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = latestPending(job.pricePool);
  const locked = job.pricePool.locked;

  const submit = () => {
    const n = Number(amount.replace(/[^\d]/g, ''));
    const err = validateAmount(n);
    if (err) return setError(err);
    const r = proposePrice(job.id, n);
    if (!r.ok) return setError(r.error);
    setError(null);
    setAmount('');
  };
  const accept = () =>
    confirmAction('Lock this price?', `${naira(pending!.amount)} will be permanently locked for this job. ${party === 'customer' ? 'You’ll then pay it into Sleek Hold.' : 'The customer will then pay it into Sleek Hold.'}`, 'Accept & lock', () => {
      const r = acceptPrice(job.id);
      if (!r.ok) showMessage('Could not accept', r.error);
    });

  if (locked) {
    return (
      <View style={{ margin: space.md, marginBottom: 0, padding: space.md, borderRadius: radius.md, backgroundColor: c.successSoft }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6}>
            <Icon name="lock-closed" size={16} color={c.success} />
            <Txt v="bodyStrong" color={c.success}>
              Price locked · {naira(locked.amount)}
            </Txt>
          </Row>
          {job.status === 'price_agreed' && party === 'customer' ? (
            <Button small full={false} title="Pay into Sleek Hold" icon="shield-checkmark-outline" onPress={() => router.push({ pathname: '/escrow/[id]', params: { id: job.id } })} />
          ) : job.status === 'price_agreed' ? (
            <Txt v="small" muted>
              Waiting for payment
            </Txt>
          ) : (
            <Txt v="small" color={c.success}>
              {job.escrow.state === 'held' || job.escrow.state === 'frozen' ? 'Held in Sleek Hold' : job.escrow.state.replace('_', ' ')}
            </Txt>
          )}
        </Row>
      </View>
    );
  }
  if (job.status !== 'requested') return null;

  return (
    <View style={{ margin: space.md, marginBottom: 0, borderRadius: radius.md, borderWidth: 1, borderColor: c.primary, backgroundColor: c.primarySoft }}>
      <Pressable onPress={() => setOpen(!open)} style={{ padding: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6}>
            <Icon name="pricetag-outline" size={16} color={c.primary} />
            <Txt v="bodyStrong">Price Pool</Txt>
            {pending ? (
              <Txt v="small" muted>
                · {pending.by === party ? 'your offer' : 'their offer'} {naira(pending.amount)}
              </Txt>
            ) : (
              <Txt v="small" muted>
                · no offer yet
              </Txt>
            )}
          </Row>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
        </Row>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm }}>
          {pending && canAccept(job.pricePool, party) ? (
            <Button title={`Accept ${naira(pending.amount)}`} icon="checkmark-circle" onPress={accept} />
          ) : pending ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="small" muted>
                Waiting for {party === 'customer' ? 'the artisan' : 'the customer'} to accept or counter.
              </Txt>
              <Pressable onPress={() => withdrawOffer(job.id)}>
                <Txt v="small" color={c.danger}>
                  Withdraw
                </Txt>
              </Pressable>
            </Row>
          ) : null}
          <Row gap={space.sm}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.sm }}>
              <Txt muted>₦</Txt>
              <TextInput
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                placeholder={pending ? 'Counter amount' : 'Propose amount'}
                placeholderTextColor={c.textMuted}
                style={{ flex: 1, minHeight: 40, color: c.text, fontSize: 16, paddingHorizontal: 4 }}
              />
            </View>
            <Button small full={false} title={pending ? 'Counter' : 'Propose'} onPress={submit} />
          </Row>
          {error ? (
            <Txt v="small" color={c.danger}>
              {error}
            </Txt>
          ) : (
            <Txt v="tiny" muted>
              Either side can propose or counter. Once both agree, the price is locked permanently.
            </Txt>
          )}
        </View>
      ) : null}
    </View>
  );
}
