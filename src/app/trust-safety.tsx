import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { SafetyButton } from '../components/jobParts';
import { Banner, Button, Card, Icon, ListItem, Row, Screen, Section, Txt } from '../components/ui';
import { AUTO_RELEASE_HOURS, COMMISSION_RATE } from '../domain/escrow';
import { useMyArtisan, useStore } from '../store';
import { space, useTheme } from '../theme';

const RULES = [
  { icon: 'lock-closed-outline', title: 'Sleek Hold for every job', body: 'Customers pay Sleek, not the artisan. Money is released only after the customer approves the proof of work — or automatically if they don’t respond.' },
  { icon: 'chatbubbles-outline', title: 'Chat stays in the app', body: 'Phone numbers (in digits or words), emails, links, social handles and requests to pay outside Sleek are blocked before they send. Every attempt is logged.' },
  { icon: 'location-outline', title: 'Address after payment', body: 'Artisans only see the area until Sleek Hold is funded. Then the exact address is unlocked for that job.' },
  { icon: 'finger-print-outline', title: 'Serious verification', body: 'NIN check, random-movement face liveness and face match. Then a separate live video for every single skill, matched to the same face.' },
  { icon: 'camera-outline', title: 'No free uploads', body: 'Photos are taken live for a specific purpose — like “photo of the issue” or “proof of work” — and logged. No gallery uploads, no files.' },
  { icon: 'call-outline', title: 'No calls', body: 'There are no calls on Sleek, and asking for one is treated as an off-app attempt.' },
];

export default function TrustSafety() {
  const { c } = useTheme();
  const artisan = useMyArtisan();
  const violations = useStore((s) => s.violations.filter((v) => v.userId === s.session.userId).length);
  const trusted = useStore((s) => s.customers.find((x) => x.id === s.session.userId)?.trustedContact);
  const jobs = useStore((s) => s.jobs);
  const userId = useStore((s) => s.session.userId);
  const activeJob = jobs.find((j) => (j.customerId === userId || j.artisanId === userId) && ['funded', 'in_progress'].includes(j.status));
  return (
    <Screen title="Help & Safety Centre">
      <Section title="Safety tools" style={{ marginTop: 0 }}>
        <Card>
          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">Need help right now?</Txt>
              <Txt v="small" muted>
                Alert Sleek Safety, call 112, or share your job details with someone you trust.
              </Txt>
            </View>
            <SafetyButton job={activeJob} />
          </Row>
          {activeJob ? (
            <Txt v="tiny" muted style={{ marginTop: 6 }}>
              LINKED TO YOUR ACTIVE JOB: {activeJob.title.toUpperCase()}
            </Txt>
          ) : null}
        </Card>
        <ListItem icon="person-add-outline" title="Trusted contact" subtitle={trusted ? `${trusted.name} · tap to change` : 'Not set — add one in Settings'} onPress={() => router.push('/settings')} />
        <ListItem icon="flag-outline" title="Dispute Centre" subtitle="Problems with a paid job" onPress={() => router.push('/disputes')} />
        <ListItem icon="help-circle-outline" title="Help & Support" subtitle="FAQs and contact support" onPress={() => router.push('/help')} />
      </Section>
      <Card style={{ backgroundColor: c.heroBg, borderColor: c.heroBg }}>
        <Row gap={space.md}>
          <Icon name="shield-checkmark" size={36} color={c.heroAccent} />
          <View style={{ flex: 1 }}>
            <Txt v="h3" color={c.heroText}>
              Stay on Sleek, stay protected
            </Txt>
            <Txt v="small" color={c.heroMuted}>
              Deals made outside the app are not covered by Sleek Hold, refunds or dispute resolution.
            </Txt>
          </View>
        </Row>
      </Card>
      <Section title="The rules">
        {RULES.map((r) => (
          <Row key={r.title} gap={space.md} style={{ alignItems: 'flex-start', marginBottom: space.md }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={r.icon} size={18} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">{r.title}</Txt>
              <Txt v="small" muted>
                {r.body}
              </Txt>
            </View>
          </Row>
        ))}
      </Section>
      <Section title="Timelines & fees">
        <Card>
          <Txt v="small">• Auto-release after proof of work: {AUTO_RELEASE_HOURS.short}h for short jobs, {AUTO_RELEASE_HOURS.normal}h for normal jobs, {AUTO_RELEASE_HOURS.large}h for large jobs.</Txt>
          <Txt v="small">• Cancel 24h+ before start: full refund. Under 24h: 90% refund, 10% to the artisan.</Txt>
          <Txt v="small">• After work starts: no cancellation — open a dispute.</Txt>
          <Txt v="small">• Sleek commission: {Math.round(COMMISSION_RATE * 100)}% from the artisan’s payout. Customers pay no fee.</Txt>
        </Card>
      </Section>
      <Section title="How trust works">
        <Txt v="small" muted>
          Completed jobs paid through Sleek Hold and good reviews raise an artisan’s ranking and unlock the Trusted badge. Cancelling funded jobs, losing disputes and trying to move customers off the app lower it — and repeated attempts lead to suspension.
        </Txt>
        {artisan || violations ? (
          <View style={{ marginTop: space.md }}>
            <Banner tone={violations ? 'warning' : 'success'} body={violations ? `You have ${violations} logged chat rule warning(s). Each one lowers your trust score.` : 'You have no rule warnings. Keep it up!'} />
          </View>
        ) : null}
      </Section>
      <Section title="Something wrong?">
        <Button variant="secondary" title="Report a problem or user" icon="flag-outline" onPress={() => router.push('/help')} />
        <Txt v="small" muted style={{ marginTop: space.sm }}>
          If someone asks you to pay outside Sleek, don’t. Report it — we act within hours.
        </Txt>
      </Section>
    </Screen>
  );
}
