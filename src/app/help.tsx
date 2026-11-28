import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Banner, Card, Icon, ListItem, Row, Screen, Section, Txt } from '../components/ui';
import { space, useTheme } from '../theme';

const FAQ = [
  { q: 'When does the artisan get paid?', a: 'When you approve the proof of work. If you don’t respond, payment is released automatically after 24, 48 or 72 hours depending on the job size. Sleek keeps a 20% commission from the artisan’s side; you pay the agreed price only.' },
  { q: 'Can I get a refund?', a: 'Yes, before work starts: full refund if you cancel 24h or more before the job, 90% if later. After work starts, open a dispute and Sleek decides using the chat and proof of work.' },
  { q: 'When can I see the artisan’s phone number?', a: 'As soon as your payment is secured in Sleek Hold. Before that, chat in the app: numbers, emails and links are blocked so nobody can pull you into an unprotected deal.' },
  { q: 'Why is my address hidden?', a: 'Artisans see only your area until you pay into Sleek Hold. This protects you from people who never intend to do the job.' },
  { q: 'How are artisans verified?', a: 'NIN check with NIMC (the name must match), a random-movement face liveness check, a face match to the NIN photo, and a separate in-app video of real work for every skill. Each skill goes live the moment it passes, and the Trust team audits every one afterwards.' },
  { q: 'How do I track a Sleek Services order?', a: 'Open the order. You’ll see your Sleek rider on the map, their bike and plate number, and their phone number (unlocked because you’ve paid).' },
  { q: 'How do Team and Agency accounts work?', a: 'They have several individually verified workers. Each worker can only do one job at a time, so a team can take more jobs at once.' },
  { q: 'What is Ugent?', a: 'Ugent is Me AI’s personal agent. It can search and book artisans for you through conversation, but every booking, price and payment needs your confirmation inside Sleek.' },
];

export default function Help() {
  const { c } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
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
      <Section title="Talk to us">
        <Card>
          <ListItem icon="chatbubbles-outline" title="Chat with Sleek Support" subtitle="Replies in the app, usually within 15 minutes" onPress={() => router.push('/support')} />
          <ListItem icon="add-circle-outline" title="Start a new conversation" subtitle="Payments, jobs, orders, verification, account" onPress={() => router.push('/support/new')} />
          <ListItem icon="logo-whatsapp" title="WhatsApp Sleek Support" subtitle="Official line · we never ask for your PIN" onPress={() => Linking.openURL('https://wa.me/2348000000999').catch(() => undefined)} />
          <ListItem icon="alert-circle-outline" title="Safety emergency" subtitle="Alerts the 24/7 safety team" onPress={() => router.push({ pathname: '/support/new', params: { category: 'safety' } })} />
        </Card>
      </Section>
      <View style={{ marginTop: space.lg }}>
        <Banner tone="primary" icon="time-outline" body="Support is available 7am–10pm every day. Urgent safety issues are handled 24/7." />
      </View>
    </Screen>
  );
}
