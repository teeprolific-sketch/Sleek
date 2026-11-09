import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { showMessage } from '../components/domain';
import { Banner, Button, Chip, Field, Icon, Row, Screen, Section, Txt } from '../components/ui';
import { moderateMessage } from '../domain/moderation';
import { space, useTheme } from '../theme';

const FAQ = [
  { q: 'When does the artisan get paid?', a: 'When you approve the proof of work. If you don’t respond, payment is released automatically after 24, 48 or 72 hours depending on the job size.' },
  { q: 'Can I get a refund?', a: 'Yes, before work starts: full refund if you cancel 24h or more before the job, 90% if later. After work starts, open a dispute and Sleek decides using the chat and proof of work.' },
  { q: 'Why can’t I send my phone number?', a: 'Off-app deals aren’t protected by escrow and are the main way people get scammed. Everything you need — chat, price, payment, updates — happens in Sleek.' },
  { q: 'Why is my address hidden?', a: 'Artisans see only your area until you fund escrow. This protects you from people who never intend to do the job.' },
  { q: 'How are artisans verified?', a: 'NIN check with NIMC, a random-movement face liveness check, a face match to the NIN photo, and a separate in-app video for every skill they offer. High-risk trades get extra human review.' },
  { q: 'How do Team and Agency accounts work?', a: 'They have several individually verified workers. Each worker can only do one job at a time, so a team can take more jobs at once.' },
  { q: 'What is Ugent?', a: 'Ugent is Me AI’s personal agent. It can search and book artisans for you through conversation, but every booking, price and payment needs your confirmation inside Sleek.' },
];

const TOPICS = ['Payment & escrow', 'A job', 'Verification', 'Sleek Services order', 'Report a user', 'Account & privacy'];

export default function Help() {
  const { c } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [msg, setMsg] = useState('');
  const send = () => {
    if (msg.trim().length < 10) return showMessage('Add more detail', 'Tell us what happened in a sentence or two.');
    const m = moderateMessage(msg);
    if (!m.allowed) return showMessage('Please remove contact details', 'Support replies in the app — you don’t need to share your number or email.');
    setMsg('');
    showMessage('Ticket received', `Our support team will reply in your notifications within 24 hours. Topic: ${topic}.`);
  };
  return (
    <Screen title="Help & Support">
      <Section title="Common questions" style={{ marginTop: 0 }}>
        {FAQ.map((f, i) => (
          <Pressable key={f.q} onPress={() => setOpen(open === i ? null : i)} style={{ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="bodyStrong" style={{ flex: 1 }}>
                {f.q}
              </Txt>
              <Icon name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
            </Row>
            {open === i ? (
              <Txt muted style={{ marginTop: 6 }}>
                {f.a}
              </Txt>
            ) : null}
          </Pressable>
        ))}
      </Section>
      <Section title="Contact support">
        <Row wrap gap={8} style={{ marginBottom: space.md }}>
          {TOPICS.map((t) => (
            <Chip key={t} label={t} selected={topic === t} onPress={() => setTopic(t)} />
          ))}
        </Row>
        <Field multiline placeholder="How can we help? Include the job reference if you have one." value={msg} onChangeText={setMsg} />
        <Button title="Send to support" icon="send" onPress={send} />
      </Section>
      <View style={{ marginTop: space.lg }}>
        <Banner tone="primary" icon="time-outline" body="Support is available 7am–10pm every day. Urgent safety issues are handled 24/7." />
      </View>
    </Screen>
  );
}
