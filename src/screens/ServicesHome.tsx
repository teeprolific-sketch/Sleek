import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Banner, Card, Chip, Icon, IconButton, Pill, Row, Screen, Segmented, Spacer, Txt } from '../components/ui';
import { categoryName } from '../data/categories';
import { SERVICE_ITEMS } from '../data/seed';
import type { ServiceItemKind } from '../domain/types';
import { useStore } from '../store';
import { radius, space, useTheme } from '../theme';
import { naira } from '../utils/format';

/**
 * Sleek Services — a separate area from "Find Artisan": tools & materials
 * shop, and equipment rentals. Can be linked to a booked job (jobId param).
 */
export default function ServicesHome() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ jobId?: string; categoryId?: string }>();
  const cartCount = useStore((s) => s.cart.length);
  const job = useStore((s) => s.jobs.find((j) => j.id === params.jobId));
  const [kind, setKind] = useState<ServiceItemKind>('product');
  const [group, setGroup] = useState<string | null>(null);

  const groups = useMemo(() => [...new Set(SERVICE_ITEMS.filter((i) => i.kind === kind).map((i) => i.group))], [kind]);
  const items = useMemo(() => {
    let list = SERVICE_ITEMS.filter((i) => i.kind === kind && (!group || i.group === group));
    if (params.categoryId) list = [...list].sort((a, b) => Number(b.relatedCategoryIds.includes(params.categoryId!)) - Number(a.relatedCategoryIds.includes(params.categoryId!)));
    return list;
  }, [kind, group, params.categoryId]);

  return (
    <Screen title="Sleek Services" subtitle="Tools, materials & rentals" back={!!params.jobId} right={<IconButton icon="cart-outline" label="Cart" badge={cartCount} onPress={() => router.push({ pathname: '/cart', params: { jobId: params.jobId ?? '' } })} />}>
      {job ? (
        <Banner tone="primary" icon="link-outline" title={`For your job: ${job.title}`} body={`Showing items useful for ${categoryName(job.categoryId)} first. You can deliver straight to your artisan.`} />
      ) : (
        <Banner tone="primary" icon="pricetag-outline" body="Partner prices from verified vendors. Delivery to you or to your artisan." />
      )}
      <Spacer />
      <Segmented value={kind} onChange={(k) => { setKind(k); setGroup(null); }} options={[{ value: 'product', label: 'Shop tools & materials' }, { value: 'rental', label: 'Rentals' }]} />
      <Spacer />
      <Row wrap gap={8}>
        <Chip label="All" selected={!group} onPress={() => setGroup(null)} />
        {groups.map((g) => (
          <Chip key={g} label={g} selected={group === g} onPress={() => setGroup(g)} />
        ))}
      </Row>
      <Spacer />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {items.map((it) => {
          const discount = it.listPrice ? Math.round((1 - it.price / it.listPrice) * 100) : 0;
          return (
            <Pressable
              key={it.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: it.id, jobId: params.jobId ?? '' } })}
              style={{ width: '48%', flexGrow: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: space.md }}
            >
              <View style={{ height: 76, borderRadius: radius.md, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={it.icon} size={34} color={c.primary} />
              </View>
              <Txt v="bodyStrong" numberOfLines={2} style={{ marginTop: space.sm, minHeight: 40 }}>
                {it.name}
              </Txt>
              <Txt v="small" muted numberOfLines={1}>
                {it.vendor}
              </Txt>
              <Row style={{ marginTop: 6, justifyContent: 'space-between' }}>
                <Txt v="bodyStrong">
                  {naira(it.price)}
                  <Txt v="small" muted>
                    /{it.unit}
                  </Txt>
                </Txt>
                {discount > 0 ? <Pill label={`-${discount}%`} tone="success" /> : null}
              </Row>
            </Pressable>
          );
        })}
      </View>
      <Spacer h={space.lg} />
      <Card onPress={() => router.push('/orders')}>
        <Row gap={space.md}>
          <Icon name="receipt-outline" color={c.primary} />
          <Txt v="bodyStrong" style={{ flex: 1 }}>
            Orders & delivery tracking
          </Txt>
          <Icon name="chevron-forward" color={c.textMuted} />
        </Row>
      </Card>
    </Screen>
  );
}
