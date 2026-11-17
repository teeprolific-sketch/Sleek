import React from 'react';
import { Pressable, View } from 'react-native';
import { useStore } from '../store';
import { radius, space, THEMES, useTheme, type ThemeName } from '../theme';
import { Icon, Txt } from './ui';

const OPTIONS: { name: ThemeName; label: string; note: string }[] = [
  { name: 'white', label: 'White', note: 'Default' },
  { name: 'black', label: 'Black', note: 'Light blue' },
  { name: 'blue', label: 'Blue', note: 'Sleek brand' },
];

/** Theme picker with a small live preview of each theme. */
export function ThemePicker() {
  const { c, mode } = useTheme();
  const setTheme = useStore((s) => s.setTheme);
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => {
        const p = THEMES[o.name];
        const on = mode === o.name;
        return (
          <Pressable
            key={o.name}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.label} theme`}
            onPress={() => setTheme(o.name)}
            style={{ flex: 1, borderRadius: radius.md, borderWidth: 2, borderColor: on ? c.primary : c.border, padding: 6, backgroundColor: c.card }}
          >
            {/* mini screen preview */}
            <View style={{ height: 74, borderRadius: radius.sm, backgroundColor: p.bg, borderWidth: 1, borderColor: p.border, padding: 6, gap: 4, overflow: 'hidden' }}>
              <View style={{ height: 6, width: '60%', borderRadius: 3, backgroundColor: p.text }} />
              <View style={{ height: 4, width: '85%', borderRadius: 2, backgroundColor: p.textMuted, opacity: 0.6 }} />
              <View style={{ height: 16, borderRadius: 4, backgroundColor: p.heroBg, marginTop: 2 }} />
              <View style={{ height: 12, width: '70%', borderRadius: 6, backgroundColor: p.primary, alignSelf: 'center', marginTop: 2 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <View>
                <Txt v="bodyStrong">{o.label}</Txt>
                <Txt v="tiny" muted>
                  {o.note.toUpperCase()}
                </Txt>
              </View>
              <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={on ? c.primary : c.textMuted} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
