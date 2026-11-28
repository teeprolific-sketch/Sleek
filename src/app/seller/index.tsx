import { Redirect, router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Banner, Button, Card, EmptyState, Icon, IconButton, KeyValue, Pill, Row, Screen, Segmented, Stat, Txt } from '../../components/ui';
import { useMySeller, useStore, useUnreadCount } from '../../store';
import { space, useTheme } from '../../theme';
import { day, naira, time } from '../../utils/format';

type Tab = 'orders' | 'products';
const ORDER_LABEL = { placed: 'To pack', confirmed: 'Rider coming', dispatched: 'On the way', delivered: 'Delivered', returned: 'Returned', cancelled: 'Cancelled' } as const;
const ORDER_TONE = { placed: 'warning', confirmed: 'info', dispatched: 'primary', delivered: 'success', returned: 'neutral', cancelled: 'neutral' } as const;

/** Sleek Services seller home: orders to pack, listings and sales. */
export default function SellerHome() {
  const { c } = useTheme();
  const me = useMySeller();
  const unread = useUnreadCount();
  const allProducts = useStore((s) => s.products);
  const allOrders = useStore((s) => s.orders);
  const rate = useStore((s) => s.platformConfig?.commissionRate ?? 0.2);
  const confirm = useStore((s) => s.sellerConfirmOrder);
  const updateProduct = useStore((s) => s.updateProduct);
  const tick = useStore((s) => s.tick);
  const [tab, setTab] = useState<Tab>('orders');
  useEffect(() => {
    const t = setInterval(() => tick(), 5000);
    return () => clearInterval(t);
  }, [tick]);

  const products = useMemo(() => allProducts.filter((p) => p.sellerId === me?.id), [allProducts, me?.id]);
  const orders = useMemo(() => allOrders.filter((o) => o.lines.some((l) => products.some((p) => p.id === l.itemId))), [allOrders, products]);
  if (!me) return null;
  if (!me.activatedAt) return <Redirect href="/verify" />;

  const mineTotal = (o: (typeof orders)[number]) => o.lines.reduce((sum, l) => {
    const p = products.find((x) => x.id === l.itemId);
    return p ? sum + p.price * l.qty * (l.rentalDays ?? 1) : sum;
  }, 0);
  const sales = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + mineTotal(o), 0);
  const toPack = orders.filter((o) => o.status === 'placed').length;

  return (
    <Screen
      title={me.businessName}
      subtitle={me.storeLive ? 'Your store is live on Sleek Services' : 'Store not live yet'}
      back={false}
      right={
        <Row gap={4}>
          <IconButton icon="notifications-outline" label="Notifications" badge={unread} onPress={() => router.push('/notifications')} />
          <IconButton icon="person-circle-outline" label="Profile" onPress={() => router.push('/seller/profile')} />
        </Row>
      }
    >
      {me.suspended ? <Banner tone="danger" icon="ban-outline" title="Store suspended" body={me.suspendedReason ?? 'Contact Sleek Support.'} action="Get help" onAction={() => router.push('/support')} /> : null}
      {!me.storeLive && !me.suspended ? <Banner tone="warning" icon="id-card-outline" title="Verify to open your store" body="NIN and face check, about 3 minutes. Your store goes live the moment it passes." action="Start verification" onAction={() => router.push('/verify')} /> : null}

      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <View style={{ flex: 1 }}>
          <Stat label="To pack" value={String(toPack)} icon="cube-outline" />
        </View>
        <View style={{ flex: 1 }}>
          <Stat label="Live items" value={String(products.filter((p) => p.status !== 'unlisted').length)} icon="pricetags-outline" />
        </View>
        <View style={{ flex: 1 }}>
          <Stat label="Sales" value={naira(sales)} icon="trending-up-outline" />
        </View>
      </Row>
      <Card tone="soft" style={{ marginTop: space.sm }}>
        <KeyValue k={`You receive (after ${Math.round(rate * 100)}% Sleek commission)`} v={naira(Math.round(sales * (1 - rate)))} strong />
        <Txt v="tiny" muted>
          Paid to {me.payoutAccount ? `${me.payoutAccount.bankName} ••${me.payoutAccount.accountNumberLast4}` : 'your bank (add it in Profile)'} once each delivery is confirmed.
        </Txt>
      </Card>

      <View style={{ marginTop: space.lg }}>
        <Segmented options={[{ value: 'orders', label: `Orders${toPack ? ` (${toPack})` : ''}` }, { value: 'products', label: `Products (${products.length})` }]} value={tab} onChange={setTab} />
      </View>

      {tab === 'orders' ? (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {orders.length ? (
            orders.map((o) => (
              <Card key={o.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="bodyStrong">Order #{o.id.slice(-6).toUpperCase()}</Txt>
                  <Pill label={ORDER_LABEL[o.status]} tone={ORDER_TONE[o.status]} />
                </Row>
                {o.lines.map((l) => {
                  const p = products.find((x) => x.id === l.itemId);
                  return p ? <KeyValue key={l.itemId} k={`${l.qty} × ${p.name}${l.rentalDays ? ` (${l.rentalDays}d)` : ''}`} v={naira(p.price * l.qty * (l.rentalDays ?? 1))} /> : null;
                })}
                <Txt v="tiny" muted>
                  Paid {day(o.placedAt)} {time(o.placedAt)} · Rider: {o.rider ? `${o.rider.name} (${o.rider.plate})` : 'being assigned'}
                </Txt>
                {o.status === 'placed' ? (
                  <Button
                    small
                    title="Confirm & pack for the rider"
                    icon="checkmark-done-outline"
                    style={{ marginTop: space.sm }}
                    onPress={() => {
                      const r = confirm(o.id);
                      if (!r.ok) showMessage('Not possible', r.error);
                    }}
                  />
                ) : null}
              </Card>
            ))
          ) : (
            <EmptyState icon="receipt-outline" title="No orders yet" body="When a customer buys or rents your items, the order appears here. A Sleek rider collects and delivers it." />
          )}
        </View>
      ) : (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Button icon="add" title="Add a product or rental" disabled={!me.storeLive || me.suspended} onPress={() => router.push('/seller/new-product')} />
          {products.map((p) => (
            <Card key={p.id}>
              <Row gap={space.md}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={p.icon} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{p.name}</Txt>
                  <Txt v="small" muted>
                    {naira(p.price)} / {p.unit} · {p.kind === 'rental' ? `${p.stock} available` : `${p.stock} in stock`}
                  </Txt>
                </View>
                <Pill label={p.status === 'unlisted' ? 'Hidden' : 'Live'} tone={p.status === 'unlisted' ? 'neutral' : 'success'} />
              </Row>
              <Row gap={space.sm} style={{ marginTop: space.sm }}>
                <Button small full={false} variant="ghost" title="+5 stock" style={{ flex: 1 }} onPress={() => updateProduct(p.id, { stock: p.stock + 5 })} />
                <Button small full={false} variant="secondary" title={p.status === 'unlisted' ? 'Show in shop' : 'Hide'} style={{ flex: 1 }} onPress={() => updateProduct(p.id, { status: p.status === 'unlisted' ? 'live' : 'unlisted' })} />
              </Row>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
