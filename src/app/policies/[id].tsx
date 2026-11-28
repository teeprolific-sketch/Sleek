import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Banner, Screen, Section, Txt } from '../../components/ui';
import { POLICIES, POLICY_VERSION, type PolicyId } from '../../legal/policies';
import { space, useTheme } from '../../theme';

export default function PolicyView() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: PolicyId }>();
  const p = POLICIES.find((x) => x.id === id);
  if (!p) return <Screen title="Policy">{<Txt>Not found.</Txt>}</Screen>;
  return (
    <Screen title={p.title} subtitle={`Version ${POLICY_VERSION}`}>
      <Banner tone="warning" icon="create-outline" body="Draft for review. Items in [square brackets] still need Sleek’s details." />
      <Txt muted style={{ marginTop: space.md }}>
        {p.summary}
      </Txt>
      {p.sections.map((s) => (
        <Section key={s.heading} title={s.heading}>
          <View style={{ gap: 8 }}>
            {s.body.map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Txt color={c.primary}>•</Txt>
                <Txt style={{ flex: 1 }}>{b}</Txt>
              </View>
            ))}
          </View>
        </Section>
      ))}
    </Screen>
  );
}
