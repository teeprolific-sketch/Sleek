import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { JobStatusPill } from '../components/domain';
import { Avatar, Card, EmptyState, Row, Screen, Txt } from '../components/ui';
import { useStore } from '../store';
import { space } from '../theme';
import { relative } from '../utils/format';

/** All job chats for the signed-in user. Every chat belongs to exactly one job. */
export default function Inbox({ title = 'Chats', emptyBody, back = false }: { title?: string; emptyBody?: string; back?: boolean }) {
  const jobs = useStore((s) => s.jobs);
  const messages = useStore((s) => s.messages);
  const artisans = useStore((s) => s.artisans);
  const customers = useStore((s) => s.customers);
  const session = useStore((s) => s.session);

  const threads = useMemo(() => {
    return jobs
      .filter((j) => j.customerId === session.userId || j.artisanId === session.userId)
      .map((j) => {
        const msgs = messages.filter((m) => m.jobId === j.id);
        const last = msgs[msgs.length - 1];
        const isCustomer = j.customerId === session.userId;
        const a = artisans.find((x) => x.id === j.artisanId);
        const cu = customers.find((x) => x.id === j.customerId);
        return { job: j, last, name: isCustomer ? a?.businessName ?? a?.name ?? '' : cu?.name ?? '', color: isCustomer ? a?.avatarColor : undefined };
      })
      .sort((x, y) => (y.last?.at ?? y.job.updatedAt).localeCompare(x.last?.at ?? x.job.updatedAt));
  }, [jobs, messages, artisans, customers, session.userId]);

  return (
    <Screen title={title} back={back}>
      {threads.length ? (
        threads.map((t) => (
          <Card key={t.job.id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: t.job.id } })} style={{ marginBottom: space.sm }}>
            <Row gap={space.md}>
              <Avatar name={t.name} color={t.color} />
              <View style={{ flex: 1 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {t.name}
                  </Txt>
                  <Txt v="tiny" muted>
                    {relative(t.last?.at ?? t.job.updatedAt)}
                  </Txt>
                </Row>
                <Txt v="small" muted numberOfLines={1}>
                  {t.job.title}
                </Txt>
                <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                  <Txt v="small" numberOfLines={1} style={{ flex: 1 }}>
                    {t.last ? (t.last.kind === 'system' ? '🛡 ' : '') + t.last.text : 'No messages yet'}
                  </Txt>
                  <JobStatusPill status={t.job.status} />
                </Row>
              </View>
            </Row>
          </Card>
        ))
      ) : (
        <EmptyState icon="chatbubbles-outline" title="No chats yet" body={emptyBody ?? 'When you request an artisan, your chat appears here. All chats stay inside Sleek.'} />
      )}
    </Screen>
  );
}
