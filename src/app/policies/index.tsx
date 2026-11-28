import { router } from 'expo-router';
import React from 'react';
import { Banner, Card, ListItem, Screen } from '../../components/ui';
import { POLICIES, POLICY_VERSION } from '../../legal/policies';
import { useCurrentUser } from '../../store';
import { space } from '../../theme';

export default function Policies() {
  const user = useCurrentUser();
  const consents = user && 'consents' in user ? user.consents ?? [] : [];
  return (
    <Screen title="Policies & rules" subtitle={`Version ${POLICY_VERSION}`}>
      <Banner tone="info" icon="document-text-outline" body="These explain what Sleek does with your data, how money works, and the penalties for breaking the rules. You agreed to the ones that apply to your account when you signed up." />
      <Card style={{ marginTop: space.md }}>
        {POLICIES.map((p) => {
          const agreed = consents.find((c) => c.policyId === p.id);
          return <ListItem key={p.id} icon={agreed ? 'checkmark-circle-outline' : 'document-text-outline'} title={p.title} subtitle={agreed ? `You agreed on ${new Date(agreed.at).toLocaleDateString('en-NG')}` : p.summary} onPress={() => router.push({ pathname: '/policies/[id]', params: { id: p.id } })} />;
        })}
      </Card>
    </Screen>
  );
}
