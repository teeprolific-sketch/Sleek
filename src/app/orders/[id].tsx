import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Banner, Card, Divider, KeyValue, Pill, Screen, Section, Steps, Txt } from '../../components/ui';
import { serviceItem } from '../../data/seed';
import { useStore } from '../../store';
import { space } from '../../theme';
import { day, naira, time } from '../../utils/format';

const STEPS = ['placed', 'confirmed', 'dispatched', 'delivered'] as const;

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const o = useStore((s) => s.orders.find((x) => x.id === id));
  const job = useStore((s) => s.jobs.find((j) => j.id === o?.jobId));
  if (!o) return <Screen title="Order">{<Txt>Not found.</Txt>}</Screen>;
  return (
    <Screen title={`Order #${o.id.slice(-6).toUpperCase()}`} right={<Pill label={o.status} tone={o.status === 'delivered' ? 'success' : 'primary'} />}>
      <Card>
        <Steps current={o.status === 'delivered' ? 4 : STEPS.indexOf(o.status as (typeof STEPS)[number])} steps={['Order placed', 'Vendor confirmed', 'Out for delivery', 'Delivered']} />
      </Card>
      {o.eta && o.status !== 'delivered' ? (
        <Banner tone="info" icon="bicycle-outline" body={`Estimated delivery: ${day(o.eta)} by ${time(o.eta)}.`} />
      ) : null}
      <Section title="Delivery">
        <Card>
          <KeyValue k="To" v={o.deliverTo === 'artisan' ? 'Your artisan' : 'You'} />
          <Txt v="small" muted>
            {o.deliveryAddress}
          </Txt>
          {job ? <KeyValue k="Linked job" v={job.title} /> : null}
        </Card>
      </Section>
      <Section title="Items">
        <Card>
          {o.lines.map((l) => {
            const it = serviceItem(l.itemId);
            return <KeyValue key={l.itemId} k={`${l.qty} × ${it?.name}${l.rentalDays ? ` (${l.rentalDays}d)` : ''}`} v={naira((it?.price ?? 0) * l.qty * (l.rentalDays ?? 1))} />;
          })}
          <Divider />
          {o.deposit ? <KeyValue k="Deposits" v={naira(o.deposit)} /> : null}
          <KeyValue k="Delivery" v={naira(o.deliveryFee)} />
          <KeyValue k="Total paid" v={naira(o.total)} strong />
        </Card>
      </Section>
      <Section title="Tracking">
        {[...o.timeline].reverse().map((t, i) => (
          <KeyValue key={i} k={t.label} v={`${day(t.at)} ${time(t.at)}`} />
        ))}
      </Section>
      <Txt v="small" muted style={{ marginTop: space.lg }}>
        Problem with an order? Contact Help & Support — vendor payouts are held until delivery is confirmed.
      </Txt>
    </Screen>
  );
}
