import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { EmptyState, Icon, Row, Screen, Txt } from '../components/ui';
import { useStore } from '../store';
import { space, useTheme } from '../theme';
import { relative } from '../utils/format';

export default function Notifications() {
  const { c } = useTheme();
  const all = useStore((s) => s.notifications);
  const userId = useStore((s) => s.session.userId);
  const markRead = useStore((s) => s.markRead);
  const markAllRead = useStore((s) => s.markAllRead);
  const list = useMemo(() => all.filter((n) => n.userId === userId), [all, userId]);
  return (
    <Screen
      title="Notifications"
      right={
        list.some((n) => !n.read) ? (
          <Pressable onPress={markAllRead} hitSlop={8}>
            <Txt v="small" color={c.primary}>
              Mark all read
            </Txt>
          </Pressable>
        ) : undefined
      }
    >
      {list.length ? (
        list.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => {
              markRead(n.id);
              if (n.link) router.push(n.link as never);
            }}
            style={{ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border }}
          >
            <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: n.read ? 'transparent' : c.primary }} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{n.title}</Txt>
                <Txt v="small" muted>
                  {n.body}
                </Txt>
                <Txt v="tiny" muted style={{ marginTop: 4 }}>
                  {relative(n.at)}
                </Txt>
              </View>
              {n.link ? <Icon name="chevron-forward" size={16} color={c.textMuted} /> : null}
            </Row>
          </Pressable>
        ))
      ) : (
        <EmptyState icon="notifications-outline" title="You’re all caught up" body="Price offers, escrow updates, proof of work and payouts will show here." />
      )}
    </Screen>
  );
}
