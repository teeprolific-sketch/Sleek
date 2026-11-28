import React, { useState } from 'react';
import { View } from 'react-native';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, Icon, Pill, Row, Screen, Section, Segmented, Txt } from '../components/ui';
import type { ProviderKey } from '../domain/types';
import { demoCode, PROVIDERS } from '../services/providers';
import { identity } from '../services/identity';
import { payments } from '../services/payments';
import { useStore } from '../store';
import { space, useTheme } from '../theme';
import { day, time } from '../utils/format';

const ICON: Record<ProviderKey, string> = { payments: 'card-outline', identity: 'id-card-outline', sms: 'chatbox-ellipses-outline', email: 'mail-outline', maps: 'map-outline', storage: 'cloud-outline', vision: 'eye-outline' };

/**
 * Demo provider console. Every outside service Sleek needs is simulated here, and
 * each call the app makes is logged so you can see exactly when a provider is used.
 */
export default function Providers() {
  const { c } = useTheme();
  const log = useStore((s) => s.providerLog);
  const emails = useStore((s) => s.emails);
  const session = useStore((s) => s.session);
  const logProvider = useStore((s) => s.logProvider);
  const sendEmailCode = useStore((s) => s.sendEmailCode);
  const [tab, setTab] = useState<'providers' | 'log' | 'inbox'>('providers');
  const [busy, setBusy] = useState<ProviderKey | null>(null);

  const test = async (key: ProviderKey) => {
    setBusy(key);
    try {
      if (key === 'payments') {
        const r = await payments.fundEscrow({ jobId: 'test', amount: 100, method: 'card' });
        logProvider('payments', 'test', `Paystack (test mode): ₦100 test charge ${r.ok ? 'succeeded' : 'failed'} · ref ${r.reference ?? '—'}`, r.ok);
      } else if (key === 'identity') {
        const r = await identity.lookupNIN('12345678901', 'Test Person');
        logProvider('identity', 'test', `Smile ID (sandbox): NIN lookup ${r.ok ? 'returned a record' : 'failed'}`, r.ok);
      } else if (key === 'sms') {
        logProvider('sms', 'test', `Termii (sandbox): test SMS queued, code ${demoCode(`t${Date.now()}`)}`);
      } else if (key === 'email') {
        sendEmailCode('test@sleek.demo');
      } else if (key === 'maps') {
        logProvider('maps', 'test', 'Google Maps (test key): route Yaba → Lekki Phase 1, 18.4 km, 41 min in traffic');
      } else if (key === 'storage') {
        logProvider('storage', 'test', 'Cloudflare R2 (test bucket): signed upload URL issued, expires in 5 min');
      } else {
        logProvider('vision', 'test', 'Google Cloud Vision (test): text found “0803…” → contact detail blocked');
      }
      setTab('log');
    } catch (e) {
      showMessage('Test failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const myEmails = emails.filter((e) => !session.userId || !e.userId || e.userId === session.userId);

  return (
    <Screen title="Connected providers" subtitle="Demo mode · every call is simulated">
      <Banner tone="info" icon="flask-outline" body="This demo build simulates each provider. No real money moves and no real messages are sent. In production each one runs on the Sleek server with Sleek’s own keys." />
      <View style={{ marginTop: space.md }}>
        <Segmented options={[{ value: 'providers', label: 'Providers' }, { value: 'log', label: `Activity (${log.length})` }, { value: 'inbox', label: `Email (${myEmails.length})` }]} value={tab} onChange={setTab} />
      </View>
      {tab === 'providers' ? (
        <Section title="What Sleek uses">
          {PROVIDERS.map((p) => (
            <Card key={p.key} style={{ marginBottom: space.sm }}>
              <Row gap={space.md}>
                <Icon name={ICON[p.key]} color={c.primary} size={22} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{p.name}</Txt>
                  <Txt v="small" muted>
                    {p.purpose}
                  </Txt>
                </View>
                <Pill label="Simulated" tone="info" />
              </Row>
              <Txt v="tiny" muted style={{ marginTop: 6 }}>
                Used for: {p.usedFor.join(' · ')}
              </Txt>
              <Txt v="tiny" muted>
                Alternatives: {p.alternatives.join(', ')}
              </Txt>
              <Button small variant="secondary" title="Run a test call" loading={busy === p.key} style={{ marginTop: space.sm }} onPress={() => test(p.key)} />
            </Card>
          ))}
        </Section>
      ) : tab === 'log' ? (
        <Section title="Recent provider calls">
          {log.length ? (
            log.slice(0, 60).map((e) => (
              <Card key={e.id} style={{ marginBottom: 6 }}>
                <Row gap={space.sm}>
                  <Icon name={e.ok ? 'checkmark-circle' : 'close-circle'} size={18} color={e.ok ? c.success : c.danger} />
                  <Txt v="small" style={{ flex: 1 }}>
                    {e.summary}
                  </Txt>
                </Row>
                <Txt v="tiny" muted style={{ marginTop: 2 }}>
                  {e.provider} · {e.action} · {day(e.at)} {time(e.at)}
                </Txt>
              </Card>
            ))
          ) : (
            <Txt muted>No calls yet. Sign in, verify, pay or order something and the calls appear here.</Txt>
          )}
        </Section>
      ) : (
        <Section title="Simulated email inbox (Resend)">
          {myEmails.length ? (
            myEmails.slice(0, 40).map((e) => (
              <Card key={e.id} style={{ marginBottom: 6 }}>
                <Txt v="bodyStrong">{e.subject}</Txt>
                <Txt v="tiny" muted>
                  To {e.to} · {day(e.at)} {time(e.at)}
                </Txt>
                <Txt v="small" style={{ marginTop: 4 }}>
                  {e.body}
                </Txt>
              </Card>
            ))
          ) : (
            <Txt muted>No emails yet.</Txt>
          )}
        </Section>
      )}
    </Screen>
  );
}
