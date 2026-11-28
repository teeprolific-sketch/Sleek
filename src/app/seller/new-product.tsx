import { router } from 'expo-router';
import React, { useState } from 'react';
import { Banner, Button, Chip, Field, Row, Screen, Segmented, Txt } from '../../components/ui';
import { useStore } from '../../store';
import { space } from '../../theme';

const GROUPS = { product: ['Tools', 'Materials', 'Parts', 'Supplies'], rental: ['Vehicles', 'Power', 'Events', 'Media', 'Construction'] };

export default function NewProduct() {
  const addProduct = useStore((s) => s.addProduct);
  const [kind, setKind] = useState<'product' | 'rental'>('product');
  const [name, setName] = useState('');
  const [group, setGroup] = useState(GROUPS.product[0]);
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [stock, setStock] = useState('');
  const [deposit, setDeposit] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const r = addProduct({ kind, name, group, price: Number(price.replace(/\D/g, '')), unit, stock: Number(stock.replace(/\D/g, '')), description, deposit: Number(deposit.replace(/\D/g, '')) || undefined });
    if (!r.ok) return setError(r.error);
    router.back();
  };

  return (
    <Screen title="New listing" footer={<Button title="Publish to Sleek Services" icon="cloud-upload-outline" onPress={save} />}>
      <Segmented options={[{ value: 'product', label: 'Product' }, { value: 'rental', label: 'Rental' }]} value={kind} onChange={(k) => { setKind(k); setGroup(GROUPS[k][0]); }} />
      <Field label="Name" value={name} onChangeText={setName} placeholder={kind === 'rental' ? 'e.g. 10kVA generator' : 'e.g. Toyota brake pads'} style={{ marginTop: space.md }} />
      <Txt v="small" style={{ fontWeight: '600', marginBottom: 6 }}>
        Category
      </Txt>
      <Row wrap gap={8} style={{ marginBottom: space.md }}>
        {GROUPS[kind].map((g) => (
          <Chip key={g} label={g} selected={group === g} onPress={() => setGroup(g)} />
        ))}
      </Row>
      <Row gap={space.sm}>
        <Field label={kind === 'rental' ? 'Price per day (₦)' : 'Price (₦)'} value={price} onChangeText={setPrice} keyboardType="number-pad" style={{ flex: 1 }} />
        <Field label="Unit" value={unit} onChangeText={setUnit} placeholder={kind === 'rental' ? 'day' : 'each'} style={{ flex: 1 }} />
      </Row>
      <Row gap={space.sm}>
        <Field label={kind === 'rental' ? 'Units available' : 'Stock'} value={stock} onChangeText={setStock} keyboardType="number-pad" style={{ flex: 1 }} />
        {kind === 'rental' ? <Field label="Refundable deposit (₦)" value={deposit} onChangeText={setDeposit} keyboardType="number-pad" style={{ flex: 1 }} /> : null}
      </Row>
      <Field label="Description" multiline value={description} onChangeText={setDescription} placeholder="Condition, sizes, what’s included." error={error} />
      <Banner tone="primary" icon="shield-checkmark-outline" body="Listings are checked automatically. Phone numbers, emails, links and handles are not allowed. Customers pay through Sleek and a Sleek rider delivers." />
    </Screen>
  );
}
