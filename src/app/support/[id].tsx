import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Card, Field, Pill, Row, Screen, Txt } from '../../components/ui';
import { moderateMessage } from '../../domain/moderation';
import { useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { day, time } from '../../utils/format';
import { TICKET_LABEL, TICKET_TONE } from './index';

export default function TicketThread() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useStore((s) => s.tickets.find((x) => x.id === id));
  const reply = useStore((s) => s.replyTicket);
  const close = useStore((s) => s.closeTicket);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!t) return <Screen title="Support">{<Txt>Not found.</Txt>}</Screen>;

  const send = () => {
    if (!moderateMessage(text).allowed) return setError('Please don’t share phone numbers or emails. We reply here.');
    const r = reply(t.id, text);
    if (!r.ok) return setError(r.error);
    setText('');
    setError(null);
  };

  return (
    <Screen title={t.subject} subtitle={`Ticket #${t.id.slice(-5).toUpperCase()}`} right={<Pill label={TICKET_LABEL[t.status]} tone={TICKET_TONE[t.status]} />}>
      {t.jobId ? <Button small variant="ghost" icon="briefcase-outline" title="Open the job" onPress={() => router.push({ pathname: '/job/[id]', params: { id: t.jobId! } })} /> : null}
      {t.orderId ? <Button small variant="ghost" icon="bicycle-outline" title="Open the order" onPress={() => router.push({ pathname: '/orders/[id]', params: { id: t.orderId! } })} /> : null}
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {t.messages.map((m) =>
          m.from === 'system' ? (
            <Txt key={m.id} v="small" muted center style={{ marginVertical: 4 }}>
              {m.text}
            </Txt>
          ) : (
            <View key={m.id} style={{ alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <View style={{ backgroundColor: m.from === 'user' ? c.primary : c.card, borderRadius: radius.lg, padding: space.md, borderWidth: m.from === 'user' ? 0 : 1, borderColor: c.border }}>
                {m.from === 'agent' ? (
                  <Txt v="tiny" style={{ fontWeight: '700', color: c.primary, marginBottom: 2 }}>
                    {m.name ?? 'Sleek Support'}
                  </Txt>
                ) : null}
                <Txt color={m.from === 'user' ? c.primaryText : c.text}>{m.text}</Txt>
              </View>
              <Txt v="tiny" muted style={{ marginTop: 2, alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                {day(m.at)} {time(m.at)}
              </Txt>
            </View>
          ),
        )}
      </View>
      {t.status === 'resolved' ? (
        <Card tone="soft" style={{ marginTop: space.lg }}>
          <Txt v="small">This conversation is resolved. Write below to reopen it.</Txt>
        </Card>
      ) : null}
      <View style={{ marginTop: space.lg }}>
        <Field multiline placeholder="Write a reply…" value={text} onChangeText={setText} error={error} />
        <Row gap={space.sm}>
          {t.status !== 'resolved' ? <Button full={false} variant="ghost" title="Mark resolved" style={{ flex: 1 }} onPress={() => close(t.id)} /> : null}
          <Button full={false} title="Send" icon="send" style={{ flex: 1 }} onPress={send} />
        </Row>
      </View>
      <View style={{ marginTop: space.lg }}>
        <Banner tone="primary" icon="lock-closed" body="Sleek staff will never ask for your PIN, password or card details." />
      </View>
    </Screen>
  );
}
