import React from 'react';
import { View } from 'react-native';
import { Banner, Card, Chip, Icon, Row, Screen, Section, Toggle, Txt } from '../components/ui';
import { DEFAULT_NOTIFICATION_PREFS, NOTIFICATION_CATEGORIES } from '../domain/notifications';
import { useStore } from '../store';
import { space, useTheme } from '../theme';

const HOURS = [20, 21, 22, 23];
const ENDS = [5, 6, 7, 8];
const h = (n: number) => `${n % 12 || 12}${n >= 12 ? 'pm' : 'am'}`;

/** Push notification centre: choose what reaches your phone. Everything still appears in the in-app inbox. */
export default function NotificationSettings() {
  const { c } = useTheme();
  const role = useStore((s) => s.session.role) ?? 'customer';
  const prefs = useStore((s) => s.notificationPrefs[s.session.userId ?? ''] ?? DEFAULT_NOTIFICATION_PREFS);
  const setPref = useStore((s) => s.setNotificationPref);
  const setQuiet = useStore((s) => s.setQuietHours);
  const cats = NOTIFICATION_CATEGORIES.filter((x) => x.roles.includes(role));

  return (
    <Screen title="Notification settings">
      <Banner tone="info" body="These control what is pushed to your phone. Everything still shows in your in-app notifications." />
      <Section title="What to send me">
        <Card>
          {cats.map((cat, i) => {
            const on = cat.locked ? true : prefs.enabled[cat.key] !== false;
            return (
              <View key={cat.key} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: space.md }}>
                    <Row gap={6}>
                      <Txt v="bodyStrong">{cat.label}</Txt>
                      {cat.locked ? <Icon name="lock-closed" size={12} color={c.textMuted} /> : null}
                    </Row>
                    <Txt v="small" muted>
                      {cat.locked ? `${cat.description} · always on for your safety` : cat.description}
                    </Txt>
                  </View>
                  {cat.locked ? <Txt v="tiny" muted>ALWAYS ON</Txt> : <Toggle label={cat.label} value={on} onChange={(v) => setPref(cat.key, v)} />}
                </Row>
              </View>
            );
          })}
        </Card>
      </Section>
      <Section title="Quiet hours">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">Mute at night</Txt>
              <Txt v="small" muted>
                Safety alerts and payments still come through.
              </Txt>
            </View>
            <Toggle label="Quiet hours" value={prefs.quietHours.enabled} onChange={(v) => setQuiet({ ...prefs.quietHours, enabled: v })} />
          </Row>
          {prefs.quietHours.enabled ? (
            <View style={{ marginTop: space.md, gap: 6 }}>
              <Txt v="small" muted>
                From
              </Txt>
              <Row wrap gap={6}>
                {HOURS.map((x) => (
                  <Chip key={x} label={h(x)} selected={prefs.quietHours.start === x} onPress={() => setQuiet({ ...prefs.quietHours, start: x })} />
                ))}
              </Row>
              <Txt v="small" muted>
                Until
              </Txt>
              <Row wrap gap={6}>
                {ENDS.map((x) => (
                  <Chip key={x} label={h(x)} selected={prefs.quietHours.end === x} onPress={() => setQuiet({ ...prefs.quietHours, end: x })} />
                ))}
              </Row>
            </View>
          ) : null}
        </Card>
      </Section>
    </Screen>
  );
}
