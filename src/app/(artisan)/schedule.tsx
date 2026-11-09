import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Avatar, Banner, Button, Card, Chip, EmptyState, Icon, Row, Screen, Section, Segmented, Toggle, Txt } from '../../components/ui';
import { categoryName } from '../../data/categories';
import { BLOCKING_STATUSES, STATUS_LABEL } from '../../domain/escrow';
import type { Job } from '../../domain/types';
import { useMyArtisan, useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { day, time } from '../../utils/format';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STARTS = [6, 7, 8, 9, 10];
const ENDS = [15, 16, 17, 18, 19, 20, 22];
const GRID_START = 6;
const GRID_END = 22;
const ROW_H = 22;
const h = (n: number) => `${n % 12 || 12}${n >= 12 ? 'pm' : 'am'}`;

type Tab = 'day' | 'week' | 'hours' | 'off';

export default function Schedule() {
  const { c } = useTheme();
  const me = useMyArtisan();
  const jobs = useStore((s) => s.jobs);
  const customers = useStore((s) => s.customers);
  const setWorkingHours = useStore((s) => s.setWorkingHours);
  const updateProfile = useStore((s) => s.updateArtisanProfile);
  const addTimeOff = useStore((s) => s.addTimeOff);
  const removeTimeOff = useStore((s) => s.removeTimeOff);
  const [tab, setTab] = useState<Tab>('day');
  const [offset, setOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [workerFilter, setWorkerFilter] = useState<string | 'all'>('all');
  const [offStart, setOffStart] = useState(1);
  const [offDays, setOffDays] = useState(1);
  const [offReason, setOffReason] = useState('Holiday');

  const myJobs = useMemo(
    () => (me ? jobs.filter((j) => j.artisanId === me.id && [...BLOCKING_STATUSES, 'price_agreed', 'requested'].includes(j.status)).filter((j) => workerFilter === 'all' || j.workerId === workerFilter) : []),
    [jobs, me, workerFilter],
  );
  if (!me) return null;
  const isTeam = me.accountType !== 'individual';
  const dayDate = new Date(Date.now() + offset * 86_400_000);
  const dayJobs = myJobs.filter((j) => new Date(j.window.start).toDateString() === dayDate.toDateString()).sort((a, b) => a.window.start.localeCompare(b.window.start));
  const offOn = (d: Date) => (me.timeOff ?? []).find((t) => new Date(t.start) <= new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59) && new Date(t.end) >= new Date(d.getFullYear(), d.getMonth(), d.getDate()));

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 + weekOffset * 7); // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86_400_000));

  const workerChips = isTeam ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm }} contentContainerStyle={{ gap: 8 }}>
      <Chip label={me.calendarMode === 'individual' ? 'All workers' : 'Shared calendar'} icon="people-outline" selected={workerFilter === 'all'} onPress={() => setWorkerFilter('all')} />
      {me.workers.filter((w) => w.active).map((w) => (
        <Chip key={w.id} label={w.name.split(' ')[0]} selected={workerFilter === w.id} onPress={() => setWorkerFilter(w.id)} />
      ))}
    </ScrollView>
  ) : null;

  return (
    <Screen title="Schedule & availability" back={false}>
      <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'hours', label: 'Hours' }, { value: 'off', label: 'Time off' }]} />

      {tab === 'day' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }} contentContainerStyle={{ gap: 8 }}>
            {Array.from({ length: 14 }, (_, o) => (
              <Chip key={o} label={day(new Date(Date.now() + o * 86_400_000))} selected={offset === o} onPress={() => setOffset(o)} />
            ))}
          </ScrollView>
          {workerChips}
          <Section title={day(dayDate)}>
            {offOn(dayDate) ? <Banner tone="warning" icon="airplane-outline" body={`Time off: ${offOn(dayDate)!.reason}. Customers can’t book you.`} /> : !me.workingHours[dayDate.getDay()] ? <Banner tone="neutral" body="You’re not working this day. Customers can’t book you." /> : null}
            {dayJobs.length ? dayJobs.map((j) => <DayBlock key={j.id} job={j} me={me} customerName={customers.find((x) => x.id === j.customerId)?.name} isTeam={isTeam} />) : (
              <Card tone="soft">
                <Txt muted>No bookings. You’re available for jobs in your working hours.</Txt>
              </Card>
            )}
          </Section>
          <Txt v="small" muted style={{ marginTop: space.md }}>
            A slot is only blocked once escrow is funded. Several jobs a day are fine as long as times don’t overlap (30-minute travel gap).
          </Txt>
        </>
      ) : null}

      {tab === 'week' ? (
        <>
          <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
            <Pressable onPress={() => setWeekOffset(weekOffset - 1)} hitSlop={10} disabled={weekOffset <= 0} accessibilityLabel="Previous week">
              <Icon name="chevron-back" color={weekOffset <= 0 ? c.border : c.text} />
            </Pressable>
            <Txt v="bodyStrong">
              {day(weekDays[0])} – {day(weekDays[6])}
            </Txt>
            <Pressable onPress={() => setWeekOffset(weekOffset + 1)} hitSlop={10} accessibilityLabel="Next week">
              <Icon name="chevron-forward" />
            </Pressable>
          </Row>
          {workerChips}
          <View style={{ flexDirection: 'row', marginTop: space.md }}>
            <View style={{ width: 34, paddingTop: 22 }}>
              {Array.from({ length: GRID_END - GRID_START }, (_, i) => (
                <Txt key={i} v="tiny" muted style={{ height: ROW_H }}>
                  {i % 2 === 0 ? h(GRID_START + i) : ''}
                </Txt>
              ))}
            </View>
            {weekDays.map((d) => {
              const hours = me.workingHours[d.getDay()];
              const off = offOn(d);
              const dj = myJobs.filter((j) => new Date(j.window.start).toDateString() === d.toDateString());
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <Pressable
                  key={d.toISOString()}
                  style={{ flex: 1 }}
                  onPress={() => {
                    const diff = Math.round((d.getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86_400_000);
                    if (diff >= 0 && diff < 14) {
                      setOffset(diff);
                      setTab('day');
                    }
                  }}
                  accessibilityLabel={`${DAY_NAMES[d.getDay()]}: ${dj.length} bookings`}
                >
                  <Txt v="tiny" center color={isToday ? c.primary : c.textMuted} style={{ height: 22 }}>
                    {SHORT[d.getDay()]} {d.getDate()}
                  </Txt>
                  <View style={{ height: (GRID_END - GRID_START) * ROW_H, marginHorizontal: 1, borderRadius: 4, backgroundColor: off ? c.warningSoft : c.neutralSoft, overflow: 'hidden' }}>
                    {hours && !off ? (
                      <View style={{ position: 'absolute', left: 0, right: 0, top: (Math.max(hours.start, GRID_START) - GRID_START) * ROW_H, height: (Math.min(hours.end, GRID_END) - Math.max(hours.start, GRID_START)) * ROW_H, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }} />
                    ) : null}
                    {dj.map((j) => {
                      const s = new Date(j.window.start);
                      const e = new Date(j.window.end);
                      const top = (s.getHours() + s.getMinutes() / 60 - GRID_START) * ROW_H;
                      const height = Math.max(10, ((e.getTime() - s.getTime()) / 3_600_000) * ROW_H);
                      const held = BLOCKING_STATUSES.includes(j.status);
                      return <View key={j.id} style={{ position: 'absolute', left: 2, right: 2, top: Math.max(0, top), height, borderRadius: 3, backgroundColor: held ? c.primary : 'transparent', borderWidth: held ? 0 : 1, borderStyle: 'dashed', borderColor: c.primary }} />;
                    })}
                    {off ? <Icon name="airplane-outline" size={14} color={c.warning} style={{ alignSelf: 'center', marginTop: 8 }} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Row wrap gap={space.md} style={{ marginTop: space.md }}>
            <Legend color={c.primary} label="Booked (escrow funded)" />
            <Legend color="transparent" border={c.primary} label="Request, not yet paid" />
            <Legend color={c.card} border={c.border} label="Working hours" />
            <Legend color={c.warningSoft} label="Time off" />
          </Row>
          <Txt v="small" muted style={{ marginTop: space.sm }}>
            Tap a day to see its bookings.
          </Txt>
        </>
      ) : null}

      {tab === 'hours' ? (
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
      ) : null}

      {tab === 'off' ? (
        <>
          <Section title="Add time off">
            <Card>
              <Txt v="small" muted>
                Starting
              </Txt>
              <Row wrap gap={6} style={{ marginVertical: 6 }}>
                {[0, 1, 2, 3, 7, 14].map((o) => (
                  <Chip key={o} label={day(new Date(Date.now() + o * 86_400_000))} selected={offStart === o} onPress={() => setOffStart(o)} />
                ))}
              </Row>
              <Txt v="small" muted>
                For
              </Txt>
              <Row wrap gap={6} style={{ marginVertical: 6 }}>
                {[1, 2, 3, 5, 7, 14].map((d) => (
                  <Chip key={d} label={`${d} day${d > 1 ? 's' : ''}`} selected={offDays === d} onPress={() => setOffDays(d)} />
                ))}
              </Row>
              <Row wrap gap={6} style={{ marginVertical: 6 }}>
                {['Holiday', 'Sick', 'Travel', 'Family', 'Training'].map((r) => (
                  <Chip key={r} label={r} selected={offReason === r} onPress={() => setOffReason(r)} />
                ))}
              </Row>
              <Button
                title="Block these days"
                icon="airplane-outline"
                onPress={() => {
                  const s = new Date(Date.now() + offStart * 86_400_000);
                  s.setHours(0, 0, 0, 0);
                  const e = new Date(s.getTime() + offDays * 86_400_000 - 60_000);
                  const r = addTimeOff({ start: s.toISOString(), end: e.toISOString(), reason: offReason });
                  if (!r.ok) showMessage('Can’t block these days', r.error);
                }}
              />
            </Card>
          </Section>
          <Section title="Upcoming time off">
            {(me.timeOff ?? []).length ? (
              (me.timeOff ?? []).map((t) => (
                <Card key={t.id} style={{ marginBottom: space.sm }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View>
                      <Txt v="bodyStrong">{t.reason}</Txt>
                      <Txt v="small" muted>
                        {day(t.start)} → {day(t.end)}
                      </Txt>
                    </View>
                    <Button small full={false} variant="ghost" title="Remove" onPress={() => removeTimeOff(t.id)} />
                  </Row>
                </Card>
              ))
            ) : (
              <EmptyState icon="airplane-outline" title="No time off planned" body="Block days you can’t work so customers don’t book you. Funded jobs can’t be blocked — finish or cancel them first." />
            )}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <Row gap={4}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color, borderWidth: border ? 1 : 0, borderColor: border, borderStyle: border && color === 'transparent' ? 'dashed' : 'solid' }} />
      <Txt v="tiny">{label}</Txt>
    </Row>
  );
}

function DayBlock({ job: j, me, customerName, isTeam }: { job: Job; me: NonNullable<ReturnType<typeof useMyArtisan>>; customerName?: string; isTeam: boolean }) {
  const { c } = useTheme();
  const w = me.workers.find((x) => x.id === j.workerId);
  const held = BLOCKING_STATUSES.includes(j.status);
  return (
    <Pressable onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}>
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
            {categoryName(j.categoryId)} · {customerName} · {STATUS_LABEL[j.status]}
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
}
