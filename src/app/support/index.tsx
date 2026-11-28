import { router } from 'expo-router';
import React from 'react';
import { Banner, Button, Card, EmptyState, Pill, Row, Screen, Section, Txt } from '../../components/ui';
import { useStore } from '../../store';
import { space } from '../../theme';
import { day, time } from '../../utils/format';

export const TICKET_LABEL = { open: 'Open', waiting_on_you: 'Reply from Sleek', resolved: 'Resolved' } as const;
export const TICKET_TONE = { open: 'warning', waiting_on_you: 'primary', resolved: 'success' } as const;

/** In-app help desk: every conversation with Sleek Support, with job or order context attached. */
export default function SupportInbox() {
  const userId = useStore((s) => s.session.userId);
  const allTickets = useStore((s) => s.tickets);
  const tickets = allTickets.filter((t) => t.userId === userId);
  return (
    <Screen title="Support" subtitle="Talk to a real person at Sleek" footer={<Button title="New conversation" icon="add" onPress={() => router.push('/support/new')} />}>
      <Banner tone="primary" icon="time-outline" body="We reply in the app, usually within 15 minutes (7am–10pm). Safety issues are handled 24/7." />
      <Section title="Your conversations">
        {!userId || !tickets.length ? (
          <EmptyState icon="chatbubbles-outline" title="No conversations yet" body="Ask about a payment, a job, an order or your account." />
        ) : (
          tickets.map((t) => {
            const last = t.messages[t.messages.length - 1];
            return (
              <Card key={t.id} onPress={() => router.push({ pathname: '/support/[id]', params: { id: t.id } })} style={{ marginBottom: space.sm }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Txt v="bodyStrong" style={{ flex: 1, marginRight: space.sm }}>
                    {t.subject}
                  </Txt>
                  <Pill label={TICKET_LABEL[t.status]} tone={TICKET_TONE[t.status]} />
                </Row>
                <Txt v="small" muted numberOfLines={2} style={{ marginTop: 4 }}>
                  {last.from === 'agent' ? `${last.name ?? 'Sleek'}: ` : last.from === 'user' ? 'You: ' : ''}
                  {last.text}
                </Txt>
                <Txt v="tiny" muted style={{ marginTop: 6 }}>
                  #{t.id.slice(-5).toUpperCase()} · {day(t.updatedAt)} {time(t.updatedAt)}
                </Txt>
              </Card>
            );
          })
        )}
      </Section>
    </Screen>
  );
}
