import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { confirmAction } from '../components/domain';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, Field, KeyValue, ListItem, Pill, Row, Screen, Section, Segmented, Toggle, Txt } from '../components/ui';
import { LANGUAGES, useT } from '../i18n';
import { ThemePicker } from '../components/ThemePicker';
import { useCurrentUser, useStore } from '../store';
import { space } from '../theme';

export default function Settings() {
  const user = useCurrentUser();
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const resetDemo = useStore((s) => s.resetDemo);
  const setLanguage = useStore((s) => s.setLanguage);
  const setTrustedContact = useStore((s) => s.setTrustedContact);
  const t = useT();
  const contact = user?.role === 'customer' ? user.trustedContact : undefined;
  const [cName, setCName] = React.useState(contact?.name ?? '');
  const [cPhone, setCPhone] = React.useState(contact?.phone ?? '');
  return (
    <Screen title="Settings & privacy">
      <Section title="Theme" style={{ marginTop: 0 }}>
        <ThemePicker />
      </Section>
      <Section title={t('settings.language')}>
        <Card>
          {LANGUAGES.map((l) => (
            <ListItem
              key={l.code}
              title={l.native}
              subtitle={l.name}
              onPress={l.available ? () => setLanguage(l.code as 'en' | 'pcm') : undefined}
              right={!l.available ? <Pill label={t('settings.comingSoon')} tone="neutral" /> : settings.language === l.code ? <Pill label="On" tone="success" icon="checkmark" /> : undefined}
            />
          ))}
        </Card>
        <Txt v="small" muted style={{ marginTop: 6 }}>
          Key screens are translated now; the rest fall back to English while we finish.
        </Txt>
      </Section>
      <Section title="Preferences">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt>Push notifications</Txt>
            <Toggle label="Push notifications" value={settings.notifications} onChange={(v) => update({ notifications: v })} />
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
            <Txt style={{ flex: 1 }}>Data saver (lower image quality)</Txt>
            <Toggle label="Data saver" value={settings.dataSaver} onChange={(v) => update({ dataSaver: v })} />
          </Row>
        </Card>
      </Section>
      {user?.role === 'customer' ? (
        <Section title="Saved addresses">
          <Card>
            {user.addresses.map((a) => (
              <KeyValue key={a.label} k={a.label} v={`${a.line1}, ${a.area}`} />
            ))}
          </Card>
          <Txt v="small" muted style={{ marginTop: 6 }}>
            Addresses are only shared with an artisan after you fund escrow for a job.
          </Txt>
        </Section>
      ) : null}
      {user?.role === 'customer' ? (
        <Section title="Trusted contact (safety)">
          <Txt v="small" muted style={{ marginBottom: 6 }}>
            Someone you trust. From the red Safety button you can send them your job details in one tap. They are never shared with artisans.
          </Txt>
          <Field placeholder="Name" value={cName} onChangeText={setCName} />
          <Field placeholder="Phone number" keyboardType="phone-pad" value={cPhone} onChangeText={setCPhone} />
          <Button
            variant="secondary"
            title={contact ? 'Update trusted contact' : 'Save trusted contact'}
            onPress={() => {
              const r = setTrustedContact(cName.trim() ? { name: cName.trim(), phone: cPhone } : undefined);
              showMessage(r.ok ? 'Saved' : 'Not saved', r.ok ? undefined : r.error);
            }}
          />
        </Section>
      ) : null}
      <Section title="Privacy">
        <Banner tone="primary" icon="lock-closed" body="Your phone number is never shown to other users. Identity documents and face data are encrypted and handled only by our licensed verification partner (NDPA 2023 compliant)." />
        <ListItem icon="document-text-outline" title="Privacy policy" onPress={() => router.push('/help')} />
        <ListItem icon="download-outline" title="Request a copy of my data" onPress={() => router.push('/help')} />
        <ListItem icon="trash-outline" title="Delete my account" danger onPress={() => router.push('/help')} />
      </Section>
      <Section title="Demo">
        <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong">Simulate no network</Txt>
            <Txt v="small" muted>
              Try the offline experience: banner, queued messages, paused payments.
            </Txt>
          </View>
          <Toggle label="Simulate offline" value={!!settings.simulateOffline} onChange={(v) => update({ simulateOffline: v })} />
        </Row>
        <ListItem
          icon="refresh-outline"
          title="Reset demo data"
          subtitle="Restore the sample artisans, jobs and accounts"
          onPress={() =>
            confirmAction('Reset demo data?', 'All local changes will be cleared.', 'Reset', () => {
              resetDemo();
              router.replace('/auth/sign-in');
            }, true)
          }
        />
      </Section>
    </Screen>
  );
}
