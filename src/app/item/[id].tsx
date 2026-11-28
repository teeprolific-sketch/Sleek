import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Card, Chip, Icon, KeyValue, Pill, Row, Screen, Section, Txt } from '../../components/ui';
import { categoryName } from '../../data/categories';
import { useStore } from '../../store';
import { radius, space, useTheme } from '../../theme';
import { day, naira } from '../../utils/format';

export default function ItemDetail() {
  const { c } = useTheme();
  const { id, jobId } = useLocalSearchParams<{ id: string; jobId?: string }>();
  const it = useStore((s) => s.products.find((p) => p.id === id));
  const addToCart = useStore((s) => s.addToCart);
  const [qty, setQty] = useState(1);
  const [days, setDays] = useState(1);
  const [startOffset, setStartOffset] = useState(1);
  if (!it) return <Screen title="Item">{<Txt>Not found.</Txt>}</Screen>;
  const rental = it.kind === 'rental';
  const total = it.price * qty * (rental ? days : 1);

  const add = () => {
    const start = new Date(Date.now() + startOffset * 86_400_000);
    start.setHours(9, 0, 0, 0);
    addToCart({ itemId: it.id, qty, rentalDays: rental ? days : undefined, rentalStart: rental ? start.toISOString() : undefined });
    router.push({ pathname: '/cart', params: { jobId: jobId ?? '' } });
  };

  return (
    <Screen title={it.name} footer={<Button title={`Add to cart · ${naira(total)}${rental && it.deposit ? ` + ${naira(it.deposit * qty)} deposit` : ''}`} icon="cart-outline" onPress={add} />}>
      <View style={{ height: 160, borderRadius: radius.lg, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={it.icon} size={72} color={c.primary} />
      </View>
      <Row style={{ marginTop: space.lg, justifyContent: 'space-between' }}>
        <Txt v="h2">
          {naira(it.price)}
          <Txt muted>/{it.unit}</Txt>
        </Txt>
        {it.listPrice ? (
          <Txt muted style={{ textDecorationLine: 'line-through' }}>
            {naira(it.listPrice)}
          </Txt>
        ) : null}
      </Row>
      <Txt style={{ marginTop: space.sm }}>{it.description}</Txt>
      <Card style={{ marginTop: space.lg }}>
        <KeyValue k="Vendor" v={it.vendor} />
        <KeyValue k="Ships from" v={it.vendorArea} />
        <KeyValue k="In stock" v={String(it.stock)} />
        {rental && it.deposit ? <KeyValue k="Refundable deposit" v={naira(it.deposit)} /> : null}
      </Card>
      {it.relatedCategoryIds.length ? (
        <Row wrap gap={6} style={{ marginTop: space.md }}>
          {it.relatedCategoryIds.map((cid) => (
            <Pill key={cid} label={`For ${categoryName(cid)}`} tone="info" />
          ))}
        </Row>
      ) : null}
      <Section title="Quantity">
        <Row gap={space.md}>
          <Button small full={false} variant="ghost" title="−" onPress={() => setQty(Math.max(1, qty - 1))} />
          <Txt v="h2">{qty}</Txt>
          <Button small full={false} variant="ghost" title="+" onPress={() => setQty(Math.min(it.stock, qty + 1))} />
        </Row>
      </Section>
      {rental ? (
        <>
          <Section title="Start date">
            <Row wrap gap={8}>
              {[1, 2, 3, 4, 5, 6, 7].map((o) => (
                <Chip key={o} label={day(new Date(Date.now() + o * 86_400_000))} selected={startOffset === o} onPress={() => setStartOffset(o)} />
              ))}
            </Row>
          </Section>
          <Section title="Rental days">
            <Row wrap gap={8}>
              {[1, 2, 3, 5, 7].map((d) => (
                <Chip key={d} label={`${d} day${d > 1 ? 's' : ''}`} selected={days === d} onPress={() => setDays(d)} />
              ))}
            </Row>
          </Section>
          <View style={{ marginTop: space.lg }}>
            <Banner tone="info" body="The deposit is refunded within 24 hours of the item being returned in good condition." />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
