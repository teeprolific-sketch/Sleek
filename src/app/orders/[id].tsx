import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ContactCard } from '../../components/ContactCard';
import { RiderMap } from '../../components/RiderMap';
import { Banner, Button, Card, Divider, Icon, KeyValue, Pill, Row, Screen, Section, Steps, Txt } from '../../components/ui';
import { useStore } from '../../store';
import { space, useTheme } from '../../theme';
import { day, naira, time } from '../../utils/format';

const STEPS = ['placed', 'confirmed', 'dispatched', 'delivered'] as const;
const LABEL: Record<string, string> = { placed: 'Placed', confirmed: 'Packed', dispatched: 'On the way', delivered: 'Delivered', returned: 'Returned', cancelled: 'Cancelled' };

/** Where the rider is (0 = at the shop, 1 = at your door), from the order's progress. */
function riderProgress(status: string, dispatchedAt: number | undefined, now: number) {
  if (status === 'delivered') return 1;
  if (status === 'dispatched' && dispatchedAt) return Math.min(0.94, 0.08 + ((now - dispatchedAt) / 90_000) * 0.86);
  return 0;
}

export default function OrderDetail() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const o = useStore((s) => s.orders.find((x) => x.id === id));
  const job = useStore((s) => s.jobs.find((j) => j.id === o?.jobId));
  const products = useStore((s) => s.products);
  const tick = useStore((s) => s.tick);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      tick();
      setNow(Date.now());
    }, 2000);
    return () => clearInterval(t);
  }, [tick]);
  if (!o) return <Screen title="Order">{<Txt>Not found.</Txt>}</Screen>;

  const dispatched = o.timeline.find((t) => /picked up/i.test(t.label));
  const progress = riderProgress(o.status, dispatched ? new Date(dispatched.at).getTime() : undefined, now);
  const minsLeft = Math.max(1, Math.round((1 - progress) * 25));
  const firstItem = products.find((p) => p.id === o.lines[0]?.itemId);
  const live = o.status === 'confirmed' || o.status === 'dispatched';

  return (
    <Screen title={`Order #${o.id.slice(-6).toUpperCase()}`} right={<Pill label={LABEL[o.status] ?? o.status} tone={o.status === 'delivered' ? 'success' : o.status === 'cancelled' ? 'danger' : 'primary'} />}>
      {o.status !== 'cancelled' ? (
        <>
          <RiderMap progress={progress} shopLabel={firstItem?.vendor ?? 'Seller'} dropLabel={o.deliverTo === 'artisan' ? 'Your artisan' : 'You'} />
          <Card style={{ marginTop: space.md }}>
            <Row gap={space.sm} style={{ alignItems: 'center' }}>
              <Icon name="bicycle" size={22} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">
                  {o.status === 'delivered' ? 'Delivered' : o.status === 'dispatched' ? `Arriving in about ${minsLeft} min` : o.status === 'confirmed' ? 'Rider is heading to the shop' : 'Waiting for the seller to pack your order'}
                </Txt>
                {o.rider ? (
                  <Txt v="small" muted>
                    {o.rider.name} · {o.rider.bike} · {o.rider.plate} · ★ {o.rider.rating}
                  </Txt>
                ) : null}
              </View>
            </Row>
            <View style={{ marginTop: space.md }}>
              <Steps current={o.status === 'delivered' ? 4 : STEPS.indexOf(o.status as (typeof STEPS)[number])} steps={['Paid', 'Packed', 'On the way', 'Delivered']} />
            </View>
          </Card>
          {o.rider && o.status !== 'delivered' ? <ContactCard unlocked who="Your Sleek rider" name={o.rider.name} phone={o.rider.phone} /> : null}
          {live ? <Banner tone="info" icon="shield-checkmark-outline" body="Only accept your order from the rider shown here. Check the plate number before you collect." /> : null}
        </>
      ) : (
        <Banner tone="danger" icon="close-circle-outline" body="This order was cancelled and refunded to your original payment method." />
      )}

      <Section title="Delivery">
        <Card>
          <KeyValue k="To" v={o.deliverTo === 'artisan' ? 'Your artisan' : 'You'} />
          <Txt v="small" muted>
            {o.deliveryAddress}
          </Txt>
          {job ? <KeyValue k="Linked job" v={job.title} /> : null}
          {o.eta && o.status !== 'delivered' && o.status !== 'cancelled' ? <KeyValue k="Latest arrival" v={`${day(o.eta)} by ${time(o.eta)}`} /> : null}
        </Card>
      </Section>
      <Section title="Items">
        <Card>
          {o.lines.map((l) => {
            const it = products.find((p) => p.id === l.itemId);
            return <KeyValue key={l.itemId} k={`${l.qty} × ${it?.name ?? 'Item'}${l.rentalDays ? ` (${l.rentalDays}d)` : ''}`} v={naira((it?.price ?? 0) * l.qty * (l.rentalDays ?? 1))} />;
          })}
          <Divider />
          {o.deposit ? <KeyValue k="Deposits" v={naira(o.deposit)} /> : null}
          <KeyValue k="Delivery" v={naira(o.deliveryFee)} />
          <KeyValue k="Total paid" v={naira(o.total)} strong />
        </Card>
      </Section>
      <Section title="History">
        {[...o.timeline].reverse().map((t, i) => (
          <KeyValue key={i} k={t.label} v={`${day(t.at)} ${time(t.at)}`} />
        ))}
      </Section>
      <Button variant="ghost" icon="help-buoy-outline" title="Problem with this order? Get help" style={{ marginTop: space.lg }} onPress={() => router.push({ pathname: '/support/new', params: { orderId: o.id, category: 'order' } })} />
    </Screen>
  );
}
