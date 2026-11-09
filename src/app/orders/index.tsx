import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Card, EmptyState, Pill, Row, Screen, Txt } from '../../components/ui';
import { useStore } from '../../store';
import { space } from '../../theme';
import { day, naira } from '../../utils/format';

const ORDER_TONE = { placed: 'info', confirmed: 'info', dispatched: 'primary', delivered: 'success', returned: 'neutral', cancelled: 'neutral' } as const;

export default function Orders() {
  const all = useStore((s) => s.orders);
  const userId = useStore((s) => s.session.userId);
  const orders = useMemo(() => all.filter((o) => o.userId === userId), [all, userId]);
  return (
    <Screen title="Orders & deliveries">
      {orders.length ? (
        orders.map((o) => (
          <Card key={o.id} onPress={() => router.push({ pathname: '/orders/[id]', params: { id: o.id } })} style={{ marginBottom: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Txt v="bodyStrong">Order #{o.id.slice(-6).toUpperCase()}</Txt>
                <Txt v="small" muted>
                  {day(o.placedAt)} · {o.lines.length} item(s) · to {o.deliverTo === 'artisan' ? 'artisan' : 'you'}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Pill label={o.status} tone={ORDER_TONE[o.status]} />
                <Txt v="bodyStrong">{naira(o.total)}</Txt>
              </View>
            </Row>
          </Card>
        ))
      ) : (
        <EmptyState icon="receipt-outline" title="No orders yet" body="Tools, materials and rentals you order from Sleek Services show up here with live delivery tracking." action="Browse Sleek Services" onAction={() => router.push('/shop')} />
      )}
    </Screen>
  );
}
