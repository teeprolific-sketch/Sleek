import React from 'react';
import { useStore } from '../../../src/store';
import { naira } from '../../../src/utils/format';
import { runOp } from '../ops';
import { Badge, Btn, done, Empty, Gate, Panel, ReasonModal, Tabs, when } from '../ui';

const OT: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = { placed: 'warn', confirmed: 'info', dispatched: 'info', delivered: 'good', cancelled: 'bad', returned: 'neutral' };
const OL: Record<string, string> = { placed: 'Paid · to pack', confirmed: 'Packed · rider coming', dispatched: 'Rider on the way', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };

export function Services() {
  const s = useStore();
  const [tab, setTab] = React.useState<'orders' | 'listings'>('orders');
  const [hide, setHide] = React.useState<string | null>(null);
  const [cancel, setCancel] = React.useState<string | null>(null);
  const customer = (id: string) => s.customers.find((c) => c.id === id)?.name ?? s.artisans.find((a) => a.id === id)?.name ?? id;
  const seller = (id?: string) => s.sellers.find((x) => x.id === id);
  return (
    <>
      <Panel pad={false} title={<Tabs value={tab} onChange={setTab} options={[{ value: 'orders', label: `Orders & riders (${s.orders.length})` }, { value: 'listings', label: `Listings (${s.products.length})` }]} />}>
        {tab === 'orders' ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Rider</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {s.orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="cellname tnum">#{o.id.slice(-6).toUpperCase()}</div>
                      <div className="tiny muted">{when(o.placedAt)}</div>
                    </td>
                    <td className="small">{customer(o.userId)}</td>
                    <td className="small">
                      {o.lines.map((l) => {
                        const p = s.products.find((x) => x.id === l.itemId);
                        return (
                          <div key={l.itemId}>
                            {l.qty} × {p?.name ?? l.itemId} <span className="muted">({p?.vendor})</span>
                          </div>
                        );
                      })}
                    </td>
                    <td className="small">{o.rider ? `${o.rider.name} · ${o.rider.plate}` : '—'}</td>
                    <td>
                      <Badge tone={OT[o.status]}>{OL[o.status]}</Badge>
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {naira(o.total)}
                    </td>
                    <td>
                      {o.status !== 'cancelled' && o.status !== 'delivered' ? (
                        <Gate perm="orders.manage" quiet>
                          <Btn sm kind="ghost" onClick={() => setCancel(o.id)}>
                            Cancel & refund
                          </Btn>
                        </Gate>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!s.orders.length ? <Empty>No orders yet.</Empty> : null}
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Seller</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {s.products.map((p) => {
                  const sel = seller(p.sellerId);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="cellname">{p.name}</div>
                        <div className="tiny muted">
                          {p.kind === 'rental' ? 'Rental' : 'Product'} · {p.group}
                        </div>
                      </td>
                      <td className="small">
                        {p.vendor}
                        {sel?.suspended ? (
                          <>
                            {' '}
                            <Badge tone="bad">seller suspended</Badge>
                          </>
                        ) : null}
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {naira(p.price)}/{p.unit}
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {p.stock}
                      </td>
                      <td>{p.status === 'unlisted' ? <Badge>Hidden</Badge> : <Badge tone="good">Live</Badge>}</td>
                      <td>
                        <Gate perm="products.moderate" quiet>
                          {p.status === 'unlisted' ? (
                            <Btn sm kind="ghost" onClick={() => done(runOp('product.status', { productId: p.id, status: 'live' }), 'Listing restored')}>
                              Restore
                            </Btn>
                          ) : (
                            <Btn sm kind="ghost" onClick={() => setHide(p.id)}>
                              Hide
                            </Btn>
                          )}
                        </Gate>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {hide ? <ReasonModal title="Hide this listing?" body="It disappears from the shop at once. The seller is told the reason. You can undo this." confirm="Hide listing" danger onCancel={() => setHide(null)} onConfirm={(reason) => { const r = done(runOp('product.status', { productId: hide, status: 'unlisted', reason }), 'Listing hidden'); if (r.ok) setHide(null); return r; }} /> : null}
      {cancel ? <ReasonModal title="Cancel and refund this order?" body="The customer is refunded in full and the rider is stood down. This can’t be undone." confirm="Cancel order" danger onCancel={() => setCancel(null)} onConfirm={(reason) => { const r = done(runOp('order.cancel', { orderId: cancel, reason }), 'Order cancelled and refunded'); if (r.ok) setCancel(null); return r; }} /> : null}
    </>
  );
}
