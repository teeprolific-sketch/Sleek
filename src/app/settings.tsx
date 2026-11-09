import { router } from 'expo-router';
import React from 'react';
import { confirmAction } from '../components/domain';
import { Banner, Card, KeyValue, ListItem, Row, Screen, Section, Segmented, Toggle, Txt } from '../components/ui';
import type { ThemeMode } from '../domain/types';
import { useCurrentUser, useStore } from '../store';
import { space } from '../theme';

export default function Settings() {
  const user = useCurrentUser();
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const setTheme = useStore((s) => s.setTheme);
  const resetDemo = useStore((s) => s.resetDemo);
  return (
    <Screen title="Settings & privacy">
      <Section title="Theme" style={{ marginTop: 0 }}>
        <Segmented<ThemeMode> value={settings.themeMode} onChange={setTheme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
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
      <Section title="Privacy">
        <Banner tone="primary" icon="lock-closed" body="Your phone number is never shown to other users. Identity documents and face data are encrypted and handled only by our licensed verification partner (NDPA 2023 compliant)." />
        <ListItem icon="document-text-outline" title="Privacy policy" onPress={() => router.push('/help')} />
        <ListItem icon="download-outline" title="Request a copy of my data" onPress={() => router.push('/help')} />
        <ListItem icon="trash-outline" title="Delete my account" danger onPress={() => router.push('/help')} />
      </Section>
      <Section title="Demo">
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
