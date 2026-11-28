import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Avatar, Banner, Button, Card, Chip, Field, Icon, Pill, Row, Screen, Section, Spacer, Steps, Txt } from '../components/ui';
import { CATEGORIES, category, POPULAR_CATEGORY_IDS } from '../data/categories';
import { suggestSlots } from '../domain/availability';
import { areaDistanceKm } from '../domain/geo';
import { moderateMessage } from '../domain/moderation';
import { rankScore } from '../domain/ranking';
import { bayesianRating } from '../domain/trust';
import type { Artisan, TimeWindow } from '../domain/types';
import { useMyCustomer, useStore } from '../store';
import { space, useTheme } from '../theme';
import { day, naira, time } from '../utils/format';

const WHEN = [
  { value: 0, label: 'As soon as possible' },
  { value: 1, label: 'From tomorrow' },
  { value: 2, label: 'From in 2 days' },
  { value: 7, label: 'Next week' },
];
const OFFER_SECONDS = 6;

type Candidate = { artisan: Artisan; slot: TimeWindow; score: number; km: number | null };
type Phase = 'form' | 'offering' | 'matched' | 'none';

/**
 * “Find me someone”: Sleek picks the best available verified artisans and offers the
 * job to them one at a time. The first to accept gets it; if one doesn’t respond in
 * time, it moves to the next. (Production: offers go out as push + SMS.)
 */
export default function Match() {
  const { c } = useTheme();
  const me = useMyCustomer();
  const artisans = useStore((s) => s.artisans);
  const jobs = useStore((s) => s.jobs);
  const createJob = useStore((s) => s.createJob);
  const [catId, setCatId] = useState<string>(POPULAR_CATEGORY_IDS[0]);
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState('');
  const [when, setWhen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [list, setList] = useState<Candidate[]>([]);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(OFFER_SECONDS);
  const [log, setLog] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cat = category(catId);

  const found = useMemo(() => (q.trim() ? CATEGORIES.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : POPULAR_CATEGORY_IDS.map(category)), [q]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  if (!me) return null;

  /** Earliest free 2-hour slot from the chosen day, looking up to a week ahead. */
  const firstSlot = (a: Artisan) => {
    for (let k = 0; k < 7; k++) {
      const d = new Date();
      d.setDate(d.getDate() + when + k);
      const slot = suggestSlots(jobs, a, catId, d, 120, Date.now())[0];
      if (slot) return slot;
    }
    return undefined;
  };
  const rank = (): Candidate[] => {
    return artisans
      .filter((a) => !a.suspended && a.identity.faceMatch === 'passed' && a.identity.postReview !== 'revoked')
      .filter((a) => [...a.skills, ...a.workers.flatMap((w) => w.skills)].some((k) => k.categoryId === catId && k.status === 'approved'))
      .map((a) => {
        const slot = firstSlot(a);
        return slot ? { artisan: a, slot, score: rankScore(a, catId, Date.now()).total, km: areaDistanceKm(me, a) } : null;
      })
      .filter((x): x is Candidate => !!x)
      .sort((x, y) => new Date(x.slot.start).setHours(0, 0, 0, 0) - new Date(y.slot.start).setHours(0, 0, 0, 0) || y.score - x.score || (x.km ?? 99) - (y.km ?? 99))
      .slice(0, 3);
  };

  const accept = (cand: Candidate) => {
    if (timer.current) clearInterval(timer.current);
    const r = createJob({ artisanId: cand.artisan.id, categoryId: catId, title: cat.name, description: desc.trim(), window: cand.slot, addressIndex: 0, issuePhotos: [], origin: 'match' });
    if (!r.ok) {
      setError(r.error);
      setPhase('form');
      return;
    }
    setPhase('matched');
    setTimeout(() => router.replace({ pathname: '/fee/[id]', params: { id: r.value } }), 1800);
  };

  const offer = (cands: Candidate[], i: number) => {
    setIdx(i);
    setLeft(OFFER_SECONDS);
    const name = cands[i].artisan.businessName ?? cands[i].artisan.name.split(' ')[0];
    setLog((l) => [...l, `Offer sent to ${name}`]);
    // Demo: when there's a fallback available, the first artisan doesn't respond in time.
    const willAccept = i > 0 || cands.length === 1;
    let t = OFFER_SECONDS;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      t -= 1;
      setLeft(t);
      if (willAccept && t <= OFFER_SECONDS - 3) {
        setLog((l) => [...l, `${name} accepted`]);
        accept(cands[i]);
      } else if (t <= 0) {
        clearInterval(timer.current!);
        setLog((l) => [...l, `${name} didn’t respond in time`]);
        if (i + 1 < cands.length) offer(cands, i + 1);
        else setPhase('none');
      }
    }, 1000);
  };

  const start = () => {
    if (desc.trim().length < 10) return setError('Describe the problem in a sentence or two.');
    const m = moderateMessage(desc);
    if (!m.allowed) return setError(m.warning!);
    setError(null);
    const cands = rank();
    setList(cands);
    setLog([]);
    if (!cands.length) return setPhase('none');
    setPhase('offering');
    offer(cands, 0);
  };

  if (phase === 'offering' || phase === 'matched') {
    const cur = list[idx];
    return (
      <Screen title="Finding your artisan">
        <Steps current={phase === 'matched' ? 3 : 1} steps={['Request', 'Offering', 'Matched']} />
        <Spacer />
        {list.map((cand, i) => {
          const a = cand.artisan;
          const active = i === idx;
          const r = bayesianRating(a.stats.ratingSum, a.stats.ratingCount);
          return (
            <Card key={a.id} style={{ marginBottom: space.sm, borderWidth: active ? 2 : 1, borderColor: active ? c.primary : c.border, opacity: i < idx ? 0.5 : 1 }}>
              <Row gap={space.md}>
                <Avatar name={a.businessName ?? a.name} color={a.avatarColor} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{a.businessName ?? a.name}</Txt>
                  <Txt v="small" muted>
                    ★ {r.toFixed(1)} · {a.stats.completedJobs} jobs · {cand.km != null ? `${cand.km.toFixed(0)} km` : a.area} · free {day(cand.slot.start)} {time(cand.slot.start)}
                  </Txt>
                </View>
                {i < idx ? <Pill label="No reply" tone="neutral" /> : active ? <Pill label={phase === 'matched' ? 'Accepted' : `${left}s`} tone={phase === 'matched' ? 'success' : 'primary'} /> : <Pill label={`#${i + 1}`} tone="neutral" />}
              </Row>
            </Card>
          );
        })}
        <Section title="What’s happening">
          {log.map((l, i) => (
            <Row key={i} gap={6} style={{ marginBottom: 4 }}>
              <Icon name="ellipse" size={8} color={c.primary} />
              <Txt v="small">{l}</Txt>
            </Row>
          ))}
        </Section>
        {phase === 'matched' && cur ? <Banner tone="success" icon="checkmark-circle" title={`Matched with ${cur.artisan.businessName ?? cur.artisan.name}`} body="Next: pay their upfront fee, then agree the price in chat." /> : null}
      </Screen>
    );
  }

  return (
    <Screen title="Find me someone" subtitle="We pick the best available verified artisan for you" footer={<Button title="Find me someone" icon="flash-outline" onPress={start} />}>
      {phase === 'none' ? <Banner tone="warning" icon="time-outline" title="Nobody free yet" body={`No verified ${cat.name.toLowerCase()} is free in the next 7 days. Try another trade, or browse artisans yourself.`} action="Browse artisans" onAction={() => router.push({ pathname: '/search', params: { categoryId: catId } })} /> : null}
      <Section title="What do you need?" style={{ marginTop: 0 }}>
        <Field placeholder="Search 100 trades" value={q} onChangeText={setQ} />
        <Row wrap gap={8}>
          {found.map((x) => (
            <Chip key={x.id} label={x.name} icon={x.icon} selected={catId === x.id} onPress={() => setCatId(x.id)} />
          ))}
        </Row>
      </Section>
      <Section title="Describe the problem">
        <Field multiline value={desc} onChangeText={setDesc} placeholder={`e.g. ${catId === 'mechanic' ? 'Car won’t start, clicking noise from the engine' : catId === 'cleaner' ? '3-bedroom flat, deep clean of kitchen and bathrooms' : 'What needs doing, and where'}`} error={error} />
      </Section>
      <Section title="When do you need it?">
        <Row wrap gap={8}>
          {WHEN.map((w) => (
            <Chip key={w.value} label={w.label} selected={when === w.value} onPress={() => setWhen(w.value)} />
          ))}
        </Row>
      </Section>
      <Spacer />
      <Banner tone="primary" icon="shield-checkmark-outline" body={`Only artisans verified for ${cat.name} are asked. You agree the price before paying, and your money stays in Sleek Hold until you approve the work.`} />
      {cat ? (
        <Txt v="tiny" muted style={{ marginTop: space.sm }}>
          Typical starting price: {naira(Math.min(...artisans.map((a) => a.startingPrices[catId]).filter(Boolean)) || 5000)}+
        </Txt>
      ) : null}
    </Screen>
  );
}
