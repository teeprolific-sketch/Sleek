import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, EmptyState, Pill, Row, Screen, Segmented, Spacer, Txt } from '../../components/ui';
import { VIOLATION_LABEL } from '../../domain/moderation';
import { useStore } from '../../store';
import { space } from '../../theme';
import { relative } from '../../utils/format';

export default function Violations() {
  const violations = useStore((s) => s.violations);
  const artisans = useStore((s) => s.artisans);
  const customers = useStore((s) => s.customers);
  const markReviewed = useStore((s) => s.markViolationReviewed);
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const list = useMemo(() => violations.filter((v) => tab === 'all' || !v.reviewed), [violations, tab]);
  const name = (id: string) => customers.find((c) => c.id === id)?.name ?? artisans.find((a) => a.id === id)?.name ?? id;
  const countFor = (id: string) => violations.filter((v) => v.userId === id).length;
  return (
    <Screen title="Rule-breaking monitor" subtitle="Blocked contact-sharing & off-app attempts" back={false}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'open', label: 'Unreviewed' }, { value: 'all', label: 'All' }]} />
      <Spacer />
      {list.length ? (
        list.map((v) => (
          <Card key={v.id} style={{ marginBottom: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">
                  {name(v.userId)} <Txt v="small" muted>({v.role})</Txt>
                </Txt>
                <Txt v="small" muted>
                  {relative(v.at)} · {countFor(v.userId)} total attempt(s)
                </Txt>
              </View>
              {countFor(v.userId) >= 3 ? <Pill label="Repeat" tone="danger" /> : null}
            </Row>
            <Row wrap gap={6} style={{ marginVertical: 6 }}>
              {v.types.map((t) => (
                <Pill key={t} label={VIOLATION_LABEL[t]} tone="warning" />
              ))}
            </Row>
            <Txt v="small" style={{ fontStyle: 'italic' }}>
              “{v.excerpt}”
            </Txt>
            {!v.reviewed ? <Button small variant="secondary" title="Mark reviewed" style={{ marginTop: space.sm }} onPress={() => markReviewed(v.id)} /> : null}
          </Card>
        ))
      ) : (
        <EmptyState icon="shield-checkmark-outline" title="Nothing to review" body="Blocked messages (phone numbers, emails, links, off-app payment requests) are logged here with a redacted excerpt." />
      )}
    </Screen>
  );
}
