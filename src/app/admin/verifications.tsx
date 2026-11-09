import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Avatar, Card, EmptyState, Pill, Row, Screen, Txt } from '../../components/ui';
import { category } from '../../data/categories';
import { verificationQueue } from '../../screens/adminQueue';
import { useStore } from '../../store';
import { space } from '../../theme';
import { relative } from '../../utils/format';

export default function VerificationQueue() {
  const artisans = useStore((s) => s.artisans);
  const queue = useMemo(() => verificationQueue(artisans), [artisans]);
  return (
    <Screen title="Skill verification queue" subtitle={`${queue.length} waiting`} back={false}>
      {queue.length ? (
        queue.map((q) => {
          const cat = category(q.skill.categoryId);
          return (
            <Card
              key={`${q.artisan.id}_${q.workerId ?? ''}_${cat.id}`}
              style={{ marginBottom: space.sm }}
              onPress={() => router.push({ pathname: '/review-skill', params: { artisanId: q.artisan.id, workerId: q.workerId ?? '', categoryId: cat.id } })}
            >
              <Row gap={space.md}>
                <Avatar name={q.workerName ?? q.artisan.name} color={q.artisan.avatarColor} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{q.workerName ?? q.artisan.name}</Txt>
                  <Txt v="small" muted>
                    {cat.name}
                    {q.workerName ? ` · ${q.artisan.businessName}` : ''} · {q.skill.submittedAt ? relative(q.skill.submittedAt) : ''}
                  </Txt>
                </View>
                {cat.risk === 'high' ? <Pill label="High-risk" tone="danger" /> : <Pill label="Standard" tone="info" />}
              </Row>
            </Card>
          );
        })
      ) : (
        <EmptyState icon="checkmark-done-outline" title="Queue is clear" body="New skill videos appear here after automatic liveness and face-match checks pass." />
      )}
    </Screen>
  );
}
