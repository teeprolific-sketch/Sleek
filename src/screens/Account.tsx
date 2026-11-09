import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { confirmAction } from '../components/domain';
import { Logo } from '../components/Logo';
import { Avatar, Card, ListItem, Row, Screen, Section, Segmented, Txt } from '../components/ui';
import type { ThemeMode } from '../domain/types';
import { useCurrentUser, useStore, useUnreadCount } from '../store';
import { space } from '../theme';
import { maskPhone } from '../utils/format';

/** Profile & settings shared by every role, with role-specific sections passed in. */
export default function Account({ children }: { children?: React.ReactNode }) {
  const user = useCurrentUser();
  const mode = useStore((s) => s.settings.themeMode);
  const setTheme = useStore((s) => s.setTheme);
  const signOut = useStore((s) => s.signOut);
  const unread = useUnreadCount();
  if (!user) return null;
  const display = user.role === 'artisan' ? user.businessName ?? user.name : user.name;
  const sub = user.role === 'artisan' ? `${user.accountType === 'individual' ? 'Artisan' : user.accountType === 'team' ? 'Team account' : 'Agency account'} · ${user.area}, ${user.city}` : user.role === 'customer' ? `${user.area}, ${user.city}` : 'Sleek Trust & Safety';

  return (
    <Screen title="Profile" back={false}>
      <Card>
        <Row gap={space.md}>
          <Avatar name={display} color={user.role === 'artisan' ? user.avatarColor : '#0B3D91'} size={60} />
          <View style={{ flex: 1 }}>
            <Txt v="h2">{display}</Txt>
            <Txt v="small" muted>
              {sub}
            </Txt>
            <Txt v="small" muted>
              {maskPhone(user.phone)} · private
            </Txt>
          </View>
        </Row>
      </Card>

      <Section title="Appearance">
        <Segmented<ThemeMode>
          value={mode}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Section>

      {children}

      <Section title="General">
        <ListItem icon="notifications-outline" title="Notifications" subtitle={unread ? `${unread} unread` : 'All caught up'} onPress={() => router.push('/notifications')} />
        <ListItem icon="sparkles-outline" title="Ugent assistant" subtitle="Let Me AI’s agent book for you, with your confirmation" onPress={() => router.push('/ugent')} />
        <ListItem icon="settings-outline" title="Settings & privacy" onPress={() => router.push('/settings')} />
        <ListItem icon="shield-checkmark-outline" title="Trust & Safety centre" onPress={() => router.push('/trust-safety')} />
        <ListItem icon="help-circle-outline" title="Help & Support" onPress={() => router.push('/help')} />
        <ListItem
          icon="log-out-outline"
          title="Sign out"
          danger
          onPress={() =>
            confirmAction('Sign out?', 'You can sign back in with your phone number.', 'Sign out', () => {
              signOut();
              router.replace('/auth/sign-in');
            })
          }
        />
      </Section>
      <View style={{ alignItems: 'center', marginTop: space.xl, gap: 6 }}>
        <Logo height={24} />
        <Txt v="small" muted center>
          by Me AI · v1.0.0
        </Txt>
      </View>
    </Screen>
  );
}
