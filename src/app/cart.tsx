import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, Chip, Divider, EmptyState, Field, Icon, KeyValue, Row, Screen, Section, Segmented, Txt } from '../components/ui';
import { serviceItem } from '../data/seed';
import { isLocationDisclosed } from '../domain/escrow';
import type { DeliveryTarget } from '../domain/types';
import type { PaymentMethod } from '../services/payments';
import { cartTotals, useCurrentUser, useStore } from '../store';
import { space, useTheme } from '../theme';
import { day, naira } from '../utils/format';

export default function Cart() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ jobId?: string }>();
  const user = useCurrentUser();
  const cart = useStore((s) => s.cart);
  const jobs = useStore((s) => s.jobs);
  const artisans = useStore((s) => s.artisans);
  const removeFromCart = useStore((s) => s.removeFromCart);
  const placeOrder = useStore((s) => s.placeOrder);
  const [deliverTo, setDeliverTo] = useState<DeliveryTarget>(params.jobId ? 'artisan' : 'customer');
  const [jobId, setJobId] = useState<string | undefined>(params.jobId || undefined);
  const [address, setAddress] = useState(user?.role === 'customer' ? `${user.addresses[0]?.line1}, ${user.addresses[0]?.area}` : user?.role === 'artisan' ? `${user.area}, ${user.city}` : '');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [loading, setLoading] = useState(false);
  const totals = cartTotals(cart);

  const linkable = useMemo(() => jobs.filter((j) => j.customerId === user?.id && isLocationDisclosed(j) && ['funded', 'in_progress'].includes(j.status)), [jobs, user?.id]);
  const linkedJob = jobs.find((j) => j.id === jobId);
  const linkedArtisan = artisans.find((a) => a.id === linkedJob?.artisanId);

  // Proximity hint: recommend the destination in the same area as most vendors.
  const vendorAreas = cart.map((l) => serviceItem(l.itemId)?.vendorArea ?? '');
  const custArea = user?.role === 'customer' ? user.area : '';
  const recommend: DeliveryTarget | null = linkedArtisan
    ? vendorAreas.filter((v) => v.includes(linkedArtisan.area)).length > vendorAreas.filter((v) => v.includes(custArea)).length
      ? 'artisan'
      : 'customer'
    : null;

  if (!cart.length) {
    return (
      <Screen title="Cart">
        <EmptyState icon="cart-outline" title="Your cart is empty" body="Browse tools, materials and rentals in Sleek Services." action="Browse Sleek Services" onAction={() => router.replace('/shop')} />
      </Screen>
    );
  }

  const order = async () => {
    setLoading(true);
    const dest = deliverTo === 'artisan' && linkedArtisan ? `${linkedArtisan.businessName ?? linkedArtisan.name} — work location, ${linkedArtisan.area}, ${linkedArtisan.city}` : address;
    const r = await placeOrder({ deliverTo, jobId, address: dest, method });
    setLoading(false);
    if (!r.ok) return showMessage('Order not placed', r.error);
    router.replace({ pathname: '/orders/[id]', params: { id: r.value } });
  };

  return (
    <Screen title="Cart & checkout" footer={<Button title={`Pay ${naira(totals.total)}`} icon="lock-closed" loading={loading} onPress={order} />}>
      {cart.map((l) => {
        const it = serviceItem(l.itemId)!;
        return (
          <Card key={l.itemId} style={{ marginBottom: space.sm }}>
            <Row gap={space.md}>
              <Icon name={it.icon} color={c.primary} size={28} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{it.name}</Txt>
                <Txt v="small" muted>
                  {l.qty} × {naira(it.price)}
                  {it.kind === 'rental' ? ` × ${l.rentalDays} day(s) from ${day(l.rentalStart!)}` : ''}
                </Txt>
              </View>
              <Pressable onPress={() => removeFromCart(l.itemId)} hitSlop={10} accessibilityLabel={`Remove ${it.name}`}>
                <Icon name="trash-outline" color={c.danger} size={18} />
              </Pressable>
            </Row>
          </Card>
        );
      })}

      {user?.role === 'customer' ? (
        <Section title="Deliver to">
          <Segmented value={deliverTo} onChange={setDeliverTo} options={[{ value: 'customer', label: 'Me' }, { value: 'artisan', label: 'My artisan' }]} />
          {deliverTo === 'artisan' ? (
            <View style={{ marginTop: space.md }}>
              {linkable.length ? (
                <>
                  <Txt v="small" muted style={{ marginBottom: 6 }}>
                    Link to a funded job:
                  </Txt>
                  <Row wrap gap={8}>
                    {linkable.map((j) => (
                      <Chip key={j.id} label={j.title} selected={jobId === j.id} onPress={() => setJobId(j.id)} />
                    ))}
                  </Row>
                </>
              ) : (
                <Banner tone="warning" body="You need a funded job before materials can go to an artisan." />
              )}
            </View>
          ) : (
            <View style={{ marginTop: space.md }}>
              <Field label="Delivery address" value={address} onChangeText={setAddress} />
            </View>
          )}
          {recommend ? (
            <Txt v="small" color={c.primary} style={{ marginTop: 6 }}>
              Tip: delivering to {recommend === 'artisan' ? 'your artisan' : 'you'} is closer to the vendor and usually faster.
            </Txt>
          ) : null}
        </Section>
      ) : (
        <Section title="Deliver to">
          <Field label="Delivery address" value={address} onChangeText={setAddress} />
        </Section>
      )}

      <Section title="Pay with">
        <Row wrap gap={8}>
          <Chip label="Card" icon="card-outline" selected={method === 'card'} onPress={() => setMethod('card')} />
          <Chip label="Transfer" icon="swap-horizontal-outline" selected={method === 'transfer'} onPress={() => setMethod('transfer')} />
          <Chip label="USSD" icon="keypad-outline" selected={method === 'ussd'} onPress={() => setMethod('ussd')} />
        </Row>
      </Section>

      <Section title="Summary">
        <Card>
          <KeyValue k="Items" v={naira(totals.subtotal)} />
          {totals.deposit ? <KeyValue k="Refundable deposits" v={naira(totals.deposit)} /> : null}
          <KeyValue k="Delivery" v={naira(totals.deliveryFee)} />
          <Divider />
          <KeyValue k="Total" v={naira(totals.total)} strong />
        </Card>
      </Section>
    </Screen>
  );
}
