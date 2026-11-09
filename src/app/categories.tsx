import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Field, Icon, ListItem, Pill, Screen, Section } from '../components/ui';
import { CATEGORIES, CATEGORY_GROUPS } from '../data/categories';
import { useTheme } from '../theme';

export default function Categories() {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const list = useMemo(() => CATEGORIES.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  return (
    <Screen title="All services" subtitle={`${CATEGORIES.length} verified trades`}>
      <Field placeholder="Search trades" value={q} onChangeText={setQ} />
      {CATEGORY_GROUPS.map((g) => {
        const items = list.filter((x) => x.group === g);
        if (!items.length) return null;
        return (
          <Section key={g} title={g} style={{ marginTop: 8 }}>
            <View>
              {items.map((cat) => (
                <ListItem
                  key={cat.id}
                  icon={cat.icon}
                  title={cat.name}
                  subtitle={cat.multiJobFriendly ? 'Quick jobs · same-day slots' : undefined}
                  right={cat.risk === 'high' ? <Pill label="Extra checks" tone="warning" /> : <Icon name="chevron-forward" size={18} color={c.textMuted} />}
                  onPress={() => router.push({ pathname: '/search', params: { categoryId: cat.id } })}
                />
              ))}
            </View>
          </Section>
        );
      })}
    </Screen>
  );
}
