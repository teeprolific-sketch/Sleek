import { Tabs } from 'expo-router/tabs';
import React from 'react';
import { useTheme } from '../theme';
import { Icon } from './ui';

export interface TabDef {
  name: string;
  title: string;
  icon: string;
  badge?: number;
}

/** Shared bottom tab bar, themed for light & dark. */
export function ThemedTabs({ tabs }: { tabs: TabDef[] }) {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.tabBar, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarBadge: t.badge ? t.badge : undefined,
            tabBarIcon: ({ color, focused }) => <Icon name={focused ? t.icon : `${t.icon}-outline`} color={color as string} size={22} />,
          }}
        />
      ))}
    </Tabs>
  );
}
