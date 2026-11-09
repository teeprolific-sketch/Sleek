import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Modal, Platform, Pressable, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isLocationDisclosed } from '../domain/escrow';
import { jobTimeline } from '../domain/timeline';
import type { Job } from '../domain/types';
import { useT, type TKey } from '../i18n';
import { useStore } from '../store';
import { radius, space, useTheme } from '../theme';
import { day, time, windowLabel } from '../utils/format';
import { confirmAction, showMessage } from './domain';
import { Button, Field, Icon, ListItem, Row, Txt } from './ui';

/** The shared job timeline — identical for customer and artisan. */
export function JobTimeline({ job, viewer }: { job: Job; viewer: 'customer' | 'artisan' }) {
  const { c } = useTheme();
  const t = useT();
  const tl = jobTimeline(job);
  // Lead-in steps are compact; the six main stages are always shown.
  const stages = tl.stages.filter((s) => !['requested', 'price_agreed'].includes(s.key) || s.state !== 'done' || job.status === 'requested' || job.status === 'price_agreed');
  return (
    <View>
      {tl.halted ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: space.md, padding: space.sm, borderRadius: radius.sm, backgroundColor: tl.halted.reason === 'disputed' ? c.dangerSoft : c.neutralSoft }}>
          <Icon name={tl.halted.reason === 'disputed' ? 'flag' : 'information-circle-outline'} size={16} color={tl.halted.reason === 'disputed' ? c.danger : c.textMuted} />
          <Txt v="small" style={{ flex: 1, fontWeight: '600' }}>
            {tl.halted.label}
          </Txt>
        </View>
      ) : null}
      {stages.map((s, i) => {
        const color = s.state === 'done' ? c.success : s.state === 'current' ? c.primary : s.state === 'halted' ? c.danger : c.border;
        const last = i === stages.length - 1;
        return (
          <View key={s.key} style={{ flexDirection: 'row', gap: space.md }} accessible accessibilityLabel={`${t(`timeline.${s.key}` as TKey)}: ${s.state}`}>
            <View style={{ alignItems: 'center', width: 24 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: s.state === 'upcoming' ? 'transparent' : color, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
                {s.state === 'done' ? <Icon name="checkmark" size={14} color="#fff" /> : s.state === 'current' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} /> : s.state === 'halted' ? <Icon name="pause" size={12} color="#fff" /> : null}
              </View>
              {!last ? <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: s.state === 'done' ? c.success : c.border }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : space.md }}>
              <Txt v={s.state === 'current' ? 'bodyStrong' : 'body'} muted={s.state === 'upcoming'}>
                {t(`timeline.${s.key}` as TKey)}
              </Txt>
              <Txt v="small" muted>
                {s.at ? `${day(s.at)} · ${time(s.at)}` : s.state === 'current' ? t('timeline.waiting') : ''}
                {s.detail ? `${s.at ? ' · ' : ''}${s.detail}` : ''}
              </Txt>
            </View>
          </View>
        );
      })}
      <Txt v="tiny" muted style={{ marginTop: space.sm }}>
        {t('timeline.sameForBoth', { other: viewer === 'customer' ? 'artisan' : 'customer' }).toUpperCase()}
      </Txt>
    </View>
  );
}

/** Heart toggle for saving an artisan. */
export function FavouriteButton({ artisanId, size = 22 }: { artisanId: string; size?: number }) {
  const { c } = useTheme();
  const isFav = useStore((s) => !!s.customers.find((x) => x.id === s.session.userId)?.favourites?.includes(artisanId));
  const role = useStore((s) => s.session.role);
  const toggle = useStore((s) => s.toggleFavourite);
  if (role !== 'customer') return null;
  return (
    <Pressable onPress={() => toggle(artisanId)} hitSlop={10} accessibilityRole="button" accessibilityLabel={isFav ? 'Remove from saved artisans' : 'Save artisan'} accessibilityState={{ selected: isFav }}>
      <Icon name={isFav ? 'heart' : 'heart-outline'} size={size} color={isFav ? '#E11D48' : c.textMuted} />
    </Pressable>
  );
}

/** Start a new booking with the same artisan, prefilled from a past job. */
export function rebook(job: Pick<Job, 'artisanId' | 'categoryId' | 'title' | 'description'>) {
  router.push({ pathname: '/book/[id]', params: { id: job.artisanId, categoryId: job.categoryId, title: job.title, description: job.description, rebook: '1' } });
}

/**
 * Emergency / safety sheet. Available on active jobs (especially once the
 * address is shared). Nothing here reveals anyone's phone number.
 */
export function SafetyButton({ job, compact }: { job?: Job; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Safety options"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DC2626', borderRadius: radius.pill, paddingHorizontal: compact ? 8 : 12, paddingVertical: compact ? 4 : 8 }}
      >
        <Icon name="shield" size={compact ? 14 : 16} color="#fff" />
        <Txt v={compact ? 'tiny' : 'small'} color="#fff" style={{ fontWeight: '800' }}>
          {t('safety.button').toUpperCase()}
        </Txt>
      </Pressable>
      <SafetySheet visible={open} onClose={() => setOpen(false)} job={job} />
    </>
  );
}

export function SafetySheet({ visible, onClose, job }: { visible: boolean; onClose: () => void; job?: Job }) {
  const { c } = useTheme();
  const t = useT();
  const raise = useStore((s) => s.raiseSafetyAlert);
  const me = useStore((s) => s.customers.find((x) => x.id === s.session.userId) ?? s.artisans.find((x) => x.id === s.session.userId));
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const contact = me && 'trustedContact' in me ? me.trustedContact : undefined;
  const disclosed = job ? isLocationDisclosed(job) : false;

  const sos = (kind: 'sos' | 'unsafe') =>
    confirmAction(kind === 'sos' ? 'Alert Sleek Safety now?' : 'Report that you feel unsafe?', 'A Sleek safety agent will be notified immediately and will follow up with you in the app.', 'Send alert', () => {
      raise(kind, note, job?.id);
      setSent(true);
    });
  const call112 = () => {
    raise('emergency_call', 'Called 112 from the app', job?.id);
    Linking.openURL('tel:112').catch(() => showMessage('Call 112', 'Dial 112 from your phone now.'));
  };
  const share = async () => {
    if (!job) return;
    const who = artisan ? `${artisan.businessName ?? artisan.name} (Sleek-verified, ID ${artisan.id.slice(-6).toUpperCase()})` : 'a Sleek artisan';
    const msg = `I'm on a Sleek job: “${job.title}”, ${windowLabel(job.window)}, with ${who}. Job ref ${job.id.slice(-6).toUpperCase()}. Location: ${job.address.area}, ${job.address.city}. If you can't reach me, contact Sleek Safety.`;
    raise('shared_with_contact', contact ? `Shared with ${contact.name}` : 'Shared via share sheet', job.id);
    try {
      if (Platform.OS !== 'web' && contact) await Linking.openURL(`sms:${contact.phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(msg)}`);
      else await Share.share({ message: msg });
    } catch {
      showMessage('Could not open sharing', msg);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
            <Row gap={6}>
              <Icon name="shield" color="#DC2626" />
              <Txt v="h2">{t('safety.title')}</Txt>
            </Row>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Icon name="close" />
            </Pressable>
          </Row>
          {sent ? (
            <View style={{ backgroundColor: c.successSoft, padding: space.md, borderRadius: radius.md, marginBottom: space.md }}>
              <Txt v="bodyStrong" color={c.success}>
                {t('safety.sent')}
              </Txt>
            </View>
          ) : null}
          <Button variant="danger" title={t('safety.sos')} icon="alert-circle" onPress={() => sos('sos')} />
          <Txt v="small" muted style={{ marginTop: 4, marginBottom: space.md }}>
            {t('safety.sosBody')}
            {disclosed ? ' Your job location and timeline are attached.' : ''}
          </Txt>
          <ListItem icon="call-outline" danger title={t('safety.call112')} subtitle="Police, fire and ambulance" onPress={call112} />
          <ListItem icon="sad-outline" title={t('safety.unsafe')} subtitle="Report it quietly — the other person is not told" onPress={() => sos('unsafe')} />
          {job ? <ListItem icon="share-social-outline" title={t('safety.share')} subtitle={contact ? `Sends to ${contact.name}` : 'Choose who to send it to (set a trusted contact in Settings)'} onPress={share} /> : null}
          <Field placeholder="Optional: what’s happening?" value={note} onChangeText={setNote} style={{ marginTop: space.sm }} />
          <Txt v="tiny" muted>
            Safety alerts are private and go only to Sleek’s Trust & Safety team.
          </Txt>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
