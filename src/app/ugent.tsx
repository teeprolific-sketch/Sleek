import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, Chip, Icon, Pill, Row, Screen, Section, Txt } from '../components/ui';
import { category } from '../data/categories';
import { executeUgentAction, runConfirmedRequest, UGENT_TOOLS } from '../ugent/actions';
import { parseIntent, windowFromText } from '../ugent/parser';
import { useStore } from '../store';
import { radius, space, useTheme } from '../theme';
import { relative } from '../utils/format';

interface Turn {
  from: 'user' | 'ugent';
  text: string;
  results?: { artisan_id: string; name: string; rating: number; completed_escrow_jobs: number; area: string; badges: string[] }[];
  categoryId?: string;
  window?: { start: string; end: string };
}

const SUGGESTIONS = ['Find a mechanic in Lagos tomorrow morning', 'I need a cleaner on Saturday 10am', 'Get me a photographer for Friday afternoon', 'What’s the status of my jobs?'];

/** Ugent console: the Me AI agent books through Sleek actions; the user confirms every step here. */
export default function Ugent() {
  const { c } = useTheme();
  const role = useStore((s) => s.session.role);
  const linked = useStore((s) => s.settings.ugentLinked);
  const update = useStore((s) => s.updateSettings);
  const decide = useStore((s) => s.decideUgentRequest);
  const allRequests = useStore((s) => s.ugentRequests);
  const userId = useStore((s) => s.session.userId);
  const requests = useMemo(() => allRequests.filter((r) => r.userId === userId), [allRequests, userId]);
  const pending = requests.filter((r) => r.status === 'pending');
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([{ from: 'ugent', text: 'Hi, I’m Ugent. Tell me what you need done and when — I’ll find verified, available artisans. I’ll always ask before booking or paying.' }]);
  const scroll = useRef<ScrollViewInstance>(null);

  if (role !== 'customer') {
    return (
      <Screen title="Ugent">
        <Banner tone="info" icon="sparkles" body="Ugent books artisans on behalf of customers. Artisan accounts receive Ugent bookings as normal job requests, marked “Booked via Ugent”." />
      </Screen>
    );
  }

  const ask = (text: string) => {
    if (!text.trim()) return;
    const intent = parseIntent(text);
    const res = executeUgentAction(intent.action, intent.args);
    let reply: Turn;
    if (res.status === 'error') reply = { from: 'ugent', text: res.error };
    else if (intent.action === 'list_my_jobs') {
      const jobs = res.status === 'ok' ? (res.data as { title: string; status: string; next_step: string }[]) : [];
      reply = { from: 'ugent', text: jobs.length ? jobs.map((j) => `• ${j.title} — ${j.status}. Next: ${j.next_step}`).join('\n') : 'You have no active jobs.' };
    } else {
      const results = res.status === 'ok' ? (res.data as Turn['results']) : [];
      reply = {
        from: 'ugent',
        text: results?.length ? `${intent.explanation}. Here are the top ${results.length}, ranked best first:` : `${intent.explanation}, but nobody is free. Try another time.`,
        results,
        categoryId: intent.categoryId,
        window: windowFromText(text),
      };
    }
    setTurns((t) => [...t, { from: 'user', text }, reply]);
    setInput('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const proposeBooking = (turn: Turn, artisanId: string, name: string) => {
    const cat = turn.categoryId ?? 'cleaner';
    const w = turn.window ?? windowFromText('tomorrow morning')!;
    const res = executeUgentAction('initiate_booking', { artisan_id: artisanId, category_id: cat, title: `${category(cat).name} (via Ugent)`, description: turns.filter((t) => t.from === 'user').slice(-1)[0]?.text ?? 'Booked via Ugent', start: w.start, end: w.end, address_label: 'Home' });
    setTurns((t) => [...t, { from: 'user', text: `Book ${name}` }, { from: 'ugent', text: res.status === 'requires_confirmation' ? `I’ve prepared it. Please confirm above: ${res.summary}` : res.status === 'error' ? res.error : 'Done.' }]);
  };

  const confirm = (id: string) => {
    const r = runConfirmedRequest(id);
    if (!r.ok) return showMessage('Not completed', r.message);
    if (r.openRoute) router.push(r.openRoute as never);
  };

  if (!linked) {
    return (
      <Screen title="Connect Ugent">
        <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.heroBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={40} color={c.heroAccent} />
          </View>
          <Txt v="h2" style={{ marginTop: space.lg }}>
            Ugent by Me AI
          </Txt>
          <Txt muted center style={{ marginTop: 6, maxWidth: 320 }}>
            Your personal agent can find and book Sleek artisans for you in plain language.
          </Txt>
        </View>
        <Card>
          <Txt v="bodyStrong">Ugent will be able to:</Txt>
          {['Search available, verified artisans', 'Check skills, reviews and free time slots', 'Prepare booking requests and price offers', 'Tell you job status'].map((x) => (
            <Row key={x} gap={8} style={{ marginTop: 8 }}>
              <Icon name="checkmark-circle" size={16} color={c.success} />
              <Txt v="small">{x}</Txt>
            </Row>
          ))}
          <Txt v="bodyStrong" style={{ marginTop: space.md }}>
            Ugent can never:
          </Txt>
          {['Book, cancel, or approve without your tap in Sleek', 'Make payments or see your card details', 'See artisans’ contact details'].map((x) => (
            <Row key={x} gap={8} style={{ marginTop: 8 }}>
              <Icon name="close-circle-outline" size={16} color={c.danger} />
              <Txt v="small">{x}</Txt>
            </Row>
          ))}
        </Card>
        <Button style={{ marginTop: space.lg }} title="Connect Ugent" icon="link-outline" onPress={() => update({ ugentLinked: true })} />
        <Txt v="small" muted center style={{ marginTop: space.md }}>
          {UGENT_TOOLS.length} actions available to the agent · you can disconnect anytime
        </Txt>
      </Screen>
    );
  }

  return (
    <Screen
      title="Ugent"
      subtitle="Me AI personal agent · connected"
      scroll={false}
      padded={false}
      right={<Chip label="Disconnect" onPress={() => update({ ugentLinked: false })} />}
      footer={
        <Row gap={space.sm}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Ugent…"
            placeholderTextColor={c.textMuted}
            onSubmitEditing={() => ask(input)}
            style={{ flex: 1, minHeight: 46, borderRadius: 23, paddingHorizontal: space.md, backgroundColor: c.surface, color: c.text, fontSize: 16 }}
          />
          <Button full={false} title="Ask" icon="sparkles" onPress={() => ask(input)} />
        </Row>
      }
    >
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {pending.length ? (
          <Section title="Waiting for your confirmation" style={{ marginTop: 0 }}>
            {pending.map((r) => (
              <Card key={r.id} style={{ marginBottom: space.sm, borderColor: c.primary, borderWidth: 2 }}>
                <Row gap={6}>
                  <Icon name="sparkles" size={14} color={c.primary} />
                  <Txt v="tiny" color={c.primary}>
                    UGENT REQUEST · {relative(r.createdAt).toUpperCase()}
                  </Txt>
                </Row>
                <Txt style={{ marginTop: 6 }}>{r.summary}</Txt>
                <Row gap={space.sm} style={{ marginTop: space.md }}>
                  <Button small full={false} variant="ghost" title="Decline" style={{ flex: 1 }} onPress={() => decide(r.id, 'rejected')} />
                  <Button small full={false} title="Confirm" icon="checkmark" style={{ flex: 1 }} onPress={() => confirm(r.id)} />
                </Row>
              </Card>
            ))}
          </Section>
        ) : null}

        {turns.map((t, i) => (
          <View key={i} style={{ alignSelf: t.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
            <View style={{ backgroundColor: t.from === 'user' ? c.primary : c.surface, padding: space.md, borderRadius: radius.lg }}>
              <Txt color={t.from === 'user' ? c.primaryText : c.text}>{t.text}</Txt>
            </View>
            {t.results?.map((r) => (
              <Card key={r.artisan_id} style={{ marginTop: space.sm }}>
                <Txt v="bodyStrong">{r.name}</Txt>
                <Txt v="small" muted>
                  ★ {r.rating} · {r.completed_escrow_jobs} escrow jobs · {r.area}
                </Txt>
                <Row wrap gap={4} style={{ marginTop: 6 }}>
                  {r.badges.slice(0, 3).map((b) => (
                    <Pill key={b} label={b} tone="info" />
                  ))}
                </Row>
                <Row gap={space.sm} style={{ marginTop: space.sm }}>
                  <Button small full={false} variant="ghost" title="Profile" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/artisan/[id]', params: { id: r.artisan_id, categoryId: t.categoryId ?? '' } })} />
                  <Button small full={false} title="Ask Ugent to book" style={{ flex: 1 }} onPress={() => proposeBooking(t, r.artisan_id, r.name)} />
                </Row>
              </Card>
            ))}
          </View>
        ))}
        {turns.length < 3 ? (
          <Row wrap gap={8}>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} onPress={() => ask(s)} />
            ))}
          </Row>
        ) : null}
        {requests.filter((r) => r.status !== 'pending').length ? (
          <Section title="History">
            {requests
              .filter((r) => r.status !== 'pending')
              .slice(0, 5)
              .map((r) => (
                <Row key={r.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }} gap={8}>
                  <Txt v="small" style={{ flex: 1 }} numberOfLines={2}>
                    {r.summary}
                  </Txt>
                  <Pill label={r.status} tone={r.status === 'confirmed' ? 'success' : r.status === 'failed' ? 'danger' : 'neutral'} />
                </Row>
              ))}
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
