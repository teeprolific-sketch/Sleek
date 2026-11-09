import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Avatar, Banner, Card, Chip, Row, Screen, Section, Segmented, Toggle, Txt } from '../../components/ui';
import { categoryName } from '../../data/categories';
import { BLOCKING_STATUSES, STATUS_LABEL } from '../../domain/escrow';
import { useMyArtisan, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { day, time } from '../../utils/format';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STARTS = [6, 7, 8, 9, 10];
const ENDS = [15, 16, 17, 18, 19, 20, 22];
const h = (n: number) => `${n % 12 || 12}${n >= 12 ? 'pm' : 'am'}`;

export default function Schedule() {
  const { c } = useTheme();
  const me = useMyArtisan();
  const jobs = useStore((s) => s.jobs);
  const customers = useStore((s) => s.customers);
  const setWorkingHours = useStore((s) => s.setWorkingHours);
  const updateProfile = useStore((s) => s.updateArtisanProfile);
  const [tab, setTab] = useState<'bookings' | 'hours'>('bookings');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [workerFilter, setWorkerFilter] = useState<string | 'all'>('all');

  const dayJobs = useMemo(() => {
    if (!me) return [];
    const d = new Date(Date.now() + offset * 86_400_000).toDateString();
    return jobs
      .filter((j) => j.artisanId === me.id && [...BLOCKING_STATUSES, 'price_agreed', 'requested'].includes(j.status) && new Date(j.window.start).toDateString() === d)
      .filter((j) => workerFilter === 'all' || j.workerId === workerFilter)
      .sort((a, b) => a.window.start.localeCompare(b.window.start));
  }, [jobs, me, offset, workerFilter]);

  if (!me) return null;
  const isTeam = me.accountType !== 'individual';

  return (
    <Screen title="Schedule & availability" back={false}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'bookings', label: 'Bookings' }, { value: 'hours', label: 'Working hours' }]} />
      {tab === 'bookings' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }} contentContainerStyle={{ gap: 8 }}>
            {Array.from({ length: 14 }, (_, o) => (
              <Chip key={o} label={day(new Date(Date.now() + o * 86_400_000))} selected={offset === o} onPress={() => setOffset(o)} />
            ))}
          </ScrollView>
          {isTeam ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm }} contentContainerStyle={{ gap: 8 }}>
              <Chip label={me.calendarMode === 'individual' ? 'All workers' : 'Shared calendar'} icon="people-outline" selected={workerFilter === 'all'} onPress={() => setWorkerFilter('all')} />
              {me.workers.filter((w) => w.active).map((w) => (
                <Chip key={w.id} label={w.name.split(' ')[0]} selected={workerFilter === w.id} onPress={() => setWorkerFilter(w.id)} />
              ))}
            </ScrollView>
          ) : null}
          <Section title={day(new Date(Date.now() + offset * 86_400_000))}>
            {me.workingHours[new Date(Date.now() + offset * 86_400_000).getDay()] ? null : <Banner tone="neutral" body="You’re not working this day. Customers can’t book you." />}
            {dayJobs.length ? (
              dayJobs.map((j) => {
                const w = me.workers.find((x) => x.id === j.workerId);
                const held = BLOCKING_STATUSES.includes(j.status);
                return (
                  <Pressable key={j.id} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}>
                    <Row style={{ alignItems: 'stretch', marginBottom: space.sm }} gap={space.md}>
                      <View style={{ width: 62 }}>
                        <Txt v="bodyStrong">{time(j.window.start)}</Txt>
                        <Txt v="small" muted>
                          {time(j.window.end)}
                        </Txt>
                      </View>
                      <View style={{ flex: 1, borderLeftWidth: 4, borderLeftColor: held ? c.primary : c.border, backgroundColor: held ? c.primarySoft : c.surface, borderRadius: radius.sm, padding: space.md }}>
                        <Txt v="bodyStrong">{j.title}</Txt>
                        <Txt v="small" muted>
                          {categoryName(j.categoryId)} · {customers.find((x) => x.id === j.customerId)?.name} · {STATUS_LABEL[j.status]}
                        </Txt>
                        {w ? (
                          <Row gap={6} style={{ marginTop: 6 }}>
                            <Avatar name={w.name} color={w.avatarColor} size={20} />
                            <Txt v="small">{w.name}</Txt>
                          </Row>
                        ) : isTeam && held ? (
                          <Txt v="small" color={c.warning}>
                            Not assigned yet
                          </Txt>
                        ) : null}
                        {!held ? (
                          <Txt v="tiny" muted style={{ marginTop: 4 }}>
                            NOT BLOCKING · SLOT HELD ONLY AFTER ESCROW
                          </Txt>
                        ) : null}
                      </View>
                    </Row>
                  </Pressable>
                );
              })
            ) : (
              <Card tone="soft">
                <Txt muted>No bookings. You’re available for jobs in your working hours.</Txt>
              </Card>
            )}
          </Section>
          <Txt v="small" muted style={{ marginTop: space.md }}>
            A time slot is only blocked once escrow is funded. You can take several jobs a day as long as times don’t overlap (we keep a 30-minute travel gap).
          </Txt>
        </>
      ) : (
        <>
          {isTeam ? (
            <Card style={{ marginTop: space.md }}>
              <Txt v="bodyStrong">Calendar mode</Txt>
              <Txt v="small" muted style={{ marginBottom: space.sm }}>
                Shared: you see and assign everyone’s jobs. Individual: each worker manages their own bookings; you still see all.
              </Txt>
              <Segmented value={me.calendarMode ?? 'shared'} onChange={(v) => updateProfile({ calendarMode: v })} options={[{ value: 'shared', label: 'Shared' }, { value: 'individual', label: 'Individual' }]} />
            </Card>
          ) : null}
          <Section title="Weekly hours">
            {DAY_NAMES.map((name, i) => {
              const hours = me.workingHours[i];
              return (
                <Card key={name} style={{ marginBottom: space.sm }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Pressable onPress={() => hours && setEditing(editing === i ? null : i)} style={{ flex: 1 }}>
                      <Txt v="bodyStrong">{name}</Txt>
                      <Txt v="small" muted>
                        {hours ? `${h(hours.start)} – ${h(hours.end)} · tap to change` : 'Not working'}
                      </Txt>
                    </Pressable>
                    <Toggle label={`${name} working`} value={!!hours} onChange={(v) => setWorkingHours(i, v ? { start: 8, end: 18 } : null)} />
                  </Row>
                  {editing === i && hours ? (
                    <View style={{ marginTop: space.md, gap: 6 }}>
                      <Txt v="small" muted>
                        Start
                      </Txt>
                      <Row wrap gap={6}>
                        {STARTS.map((s) => (
                          <Chip key={s} label={h(s)} selected={hours.start === s} onPress={() => setWorkingHours(i, { ...hours, start: s })} />
                        ))}
                      </Row>
                      <Txt v="small" muted>
                        End
                      </Txt>
                      <Row wrap gap={6}>
                        {ENDS.map((e) => (
                          <Chip key={e} label={h(e)} selected={hours.end === e} onPress={() => setWorkingHours(i, { ...hours, end: e })} />
                        ))}
                      </Row>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </Section>
        </>
      )}
    </Screen>
  );
}
