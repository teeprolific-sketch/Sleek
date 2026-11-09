/**
 * Cross-cutting feedback components: network banner, escrow badge, live
 * countdown, first-run tips, and the error/poor-network fallback.
 */
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Job } from '../domain/types';
import { useT } from '../i18n';
import { useStore } from '../store';
import { radius, space, useTheme } from '../theme';
import { countdown, naira } from '../utils/format';
import { Button, Icon, Row, Txt } from './ui';

/** Subscribes to connectivity and keeps the store informed (drives the chat outbox and payment guards). */
export function useNetworkWatcher() {
  const setNetwork = useStore((s) => s.setNetwork);
  const simulate = useStore((s) => !!s.settings.simulateOffline);
  useEffect(() => {
    if (simulate) {
      setNetwork({ online: false, weak: false });
      return;
    }
    const unsub = NetInfo.addEventListener((st) => {
      const online = st.isConnected !== false && st.isInternetReachable !== false;
      const gen = st.type === 'cellular' ? st.details?.cellularGeneration : null;
      setNetwork({ online, weak: online && (gen === '2g' || gen === '3g') });
    });
    return () => unsub();
  }, [setNetwork, simulate]);
}

/** Thin banner at the top of every screen when offline or on a weak connection. */
export function NetworkBanner() {
  const t = useT();
  const net = useStore((s) => s.network);
  const queued = useStore((s) => s.outbox.length);
  const [justBack, setJustBack] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  useEffect(() => {
    if (!net.online) setWasOffline(true);
    else if (wasOffline) {
      setWasOffline(false);
      setJustBack(true);
      const id = setTimeout(() => setJustBack(false), 2500);
      return () => clearTimeout(id);
    }
  }, [net.online, wasOffline]);
  if (net.online && !net.weak && !justBack) return null;
  const bg = !net.online ? '#7F1D1D' : justBack ? '#14532D' : '#78350F';
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: bg, paddingHorizontal: space.md, paddingVertical: 6 }}>
      <Row gap={6}>
        <Icon name={!net.online ? 'cloud-offline-outline' : justBack ? 'checkmark-circle' : 'cellular-outline'} size={14} color="#fff" />
        <Txt v="small" color="#fff" style={{ flex: 1, fontWeight: '600' }}>
          {!net.online ? t('net.offline') : justBack ? t('net.back') : t('net.weak')}
          {!net.online && queued ? ` · ${queued} queued` : ''}
        </Txt>
      </Row>
      {!net.online ? (
        <Txt v="tiny" color="#FECACA" style={{ marginTop: 2, fontWeight: '400' }}>
          {t('net.offlineBody')}
        </Txt>
      ) : null}
    </View>
  );
}

/** "Escrow Protected" badge shown on every job. */
export function EscrowBadge({ job, compact }: { job: Job; compact?: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const held = job.escrow.state === 'held' || job.escrow.state === 'frozen';
  const settled = ['released', 'refunded', 'partially_refunded'].includes(job.escrow.state);
  const label = held ? (compact ? t('escrow.protected') : t('escrow.protectedHeld', { amount: naira(job.escrow.amount) })) : settled ? t('escrow.protected') : t('escrow.notFunded');
  const color = held || settled ? c.success : c.textMuted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: color }}>
      <Icon name={held || settled ? 'shield-checkmark' : 'shield-outline'} size={12} color={color} />
      <Txt v="tiny" color={color}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

/** Live countdown that re-renders every 30s (every second in the final minute). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function AutoReleaseCountdown({ job, compact }: { job: Job; compact?: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const target = job.proof?.autoReleaseAt;
  const remaining = target ? new Date(target).getTime() - Date.now() : 0;
  const now = useNow(remaining < 3_600_000 ? 1000 : 30_000);
  if (job.status !== 'proof_submitted' || !target) return null;
  const left = new Date(target).getTime() - now;
  const total = new Date(target).getTime() - new Date(job.proof!.submittedAt).getTime();
  const pct = Math.max(0, Math.min(1, 1 - left / total));
  const urgent = left < 6 * 3_600_000;
  const color = urgent ? c.danger : c.warning;
  if (compact) {
    return (
      <Row gap={4}>
        <Icon name="hourglass-outline" size={12} color={color} />
        <Txt v="tiny" color={color}>
          {t('escrow.autoRelease', { time: countdown(target, now) }).toUpperCase()}
        </Txt>
      </Row>
    );
  }
  return (
    <View style={{ borderRadius: radius.md, padding: space.md, backgroundColor: urgent ? c.dangerSoft : c.warningSoft }}>
      <Row gap={6}>
        <Icon name="hourglass-outline" size={18} color={color} />
        <Txt v="h3" color={color}>
          {countdown(target, now)}
        </Txt>
      </Row>
      <Txt v="small" style={{ marginTop: 4 }}>
        {t('escrow.autoReleaseSoon', { time: countdown(target, now) })}
      </Txt>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border, marginTop: space.sm, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: color }} />
      </View>
    </View>
  );
}

/** One-time educational tip for first-time users. Dismissal is remembered. */
export function CoachTip({ id, title, body, icon = 'bulb-outline' }: { id: string; title: string; body: string; icon?: string }) {
  const { c } = useTheme();
  const t = useT();
  const seen = useStore((s) => (s.settings.seenTips ?? []).includes(id));
  const dismiss = useStore((s) => s.dismissTip);
  if (seen) return null;
  return (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary, backgroundColor: c.primarySoft, padding: space.md, marginVertical: space.sm }}>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Icon name={icon} size={18} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Txt v="bodyStrong">{title}</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>
            {body}
          </Txt>
        </View>
        <Pressable onPress={() => dismiss(id)} hitSlop={10} accessibilityLabel="Dismiss tip">
          <Icon name="close" size={16} color={c.textMuted} />
        </Pressable>
      </Row>
      <Pressable onPress={() => dismiss(id)} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
        <Txt v="small" color={c.primary} style={{ fontWeight: '700' }}>
          {t('common.gotIt')}
        </Txt>
      </Pressable>
    </View>
  );
}

/** Full-screen fallback used by the error boundary and failed loads. */
export function ErrorScreen({ title, body, onRetry, icon = 'alert-circle-outline' }: { title: string; body: string; onRetry?: () => void; icon?: string }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: c.bg }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.warningSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={40} color={c.warning} />
      </View>
      <Txt v="h2" center style={{ marginTop: space.lg }}>
        {title}
      </Txt>
      <Txt muted center style={{ marginTop: space.sm, maxWidth: 320 }}>
        {body}
      </Txt>
      <View style={{ marginTop: space.xl, gap: space.sm, width: '100%', maxWidth: 320 }}>
        {onRetry ? <Button title={t('common.retry')} icon="refresh-outline" onPress={onRetry} /> : null}
        <Button variant="ghost" title={t('error.goHome')} onPress={() => router.replace('/')} />
      </View>
    </View>
  );
}
