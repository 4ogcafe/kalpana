import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { BellRing, CheckCircle2, Droplets, Minus, Plus, Printer, Receipt, Users, X } from 'lucide-react';
import { apiFetch, errorMessage } from '../../../lib/api';
import { formatOrderNumber, yen } from '../../../lib/format';
import { alertText, type DietaryAlert } from '../dietary';
import { restaurantName } from './qr-print';

type Status = 'NEW' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';

interface SessionDetail {
  id: string;
  tableNumber: string;
  status: 'OPEN' | 'BILL_REQUESTED' | 'CLOSED';
  guests: number | null;
  openedAt: string;
  calls: { id: string; type: 'STAFF' | 'WATER' | 'BILL'; createdAt: string; resolvedAt: string | null }[];
  members: { id: string; name: string; dietaryAlert: DietaryAlert | null }[];
  orders: { id: string; number: number; status: Status; note: string | null; placedBy?: string; createdAt: string; items: { nameEn: string; nameJa: string | null; quantity: number; lineTotal: number }[]; grandTotal: number }[];
  bill: { lines: { nameEn: string; nameJa: string | null; unitPrice: number; quantity: number; lineTotal: number }[]; subtotal: number; tax: number; total: number; inProgress: number; ready: number };
}

interface MenuGroup {
  id: string;
  nameEn: string;
  nameJa: string | null;
  items: { id: string; nameEn: string; nameJa: string | null; price: number; isSoldOut: boolean }[];
}

const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  NEW: { label: 'New', color: '#92400e', bg: '#fef3c7' },
  CONFIRMED: { label: 'Cooking', color: '#1e40af', bg: '#dbeafe' },
  READY: { label: 'Ready to serve', color: '#065f46', bg: '#d1fae5' },
  COMPLETED: { label: 'Served', color: '#374151', bg: '#f3f4f6' },
  CANCELLED: { label: 'Cancelled', color: '#991b1b', bg: '#fee2e2' },
};
const NEXT: Partial<Record<Status, { status: Status; label: string }>> = {
  NEW: { status: 'CONFIRMED', label: 'Accept' },
  CONFIRMED: { status: 'READY', label: 'Ready' },
  READY: { status: 'COMPLETED', label: 'Served' },
};
const CALL_LABEL = { STAFF: 'Calling staff', WATER: 'Water please', BILL: 'Bill requested' };
const PAYMENTS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'QR', label: 'QR pay (PayPay etc.)' },
  { value: 'OTHER', label: 'Other' },
];
const time = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

/** One table's visit: calls, every order with its status, staff ordering, the bill, and payment. */
export default function TableDetail({ sessionId, onClose, onChanged }: { sessionId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  // When the detail was last loaded; "seated for" is measured from this, refreshed every load.
  const [loadedAt, setLoadedAt] = useState(0);
  const [shopName, setShopName] = useState('カルパナ Kalpana');
  useEffect(() => {
    restaurantName().then(setShopName);
  }, []);

  const load = useCallback(() => {
    apiFetch(`/api/v1/dining/sessions/${sessionId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(data => {
        setDetail(data);
        setLoadedAt(Date.now());
      })
      .catch(() => toast.error('Could not load the table.'));
  }, [sessionId]);

  useEffect(() => {
    load();
    const intervalId = setInterval(load, 10_000);
    return () => clearInterval(intervalId);
  }, [load]);

  const run = async (request: () => Promise<Response>, success: string, fallback: string) => {
    setBusy(true);
    try {
      const res = await request();
      if (res.ok) {
        if (success) toast.success(success);
        load();
        onChanged();
        return true;
      }
      toast.error(await errorMessage(res, fallback));
    } catch {
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
    return false;
  };

  const post = (path: string, body?: object) =>
    apiFetch(`/api/v1/dining${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const moveOrder = (id: string, status: Status) =>
    run(() => apiFetch(`/api/v1/orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }), '', 'Could not update the order.');

  const serveAllReady = async () => {
    for (const order of detail?.orders.filter(o => o.status === 'READY') ?? []) await moveOrder(order.id, 'COMPLETED');
  };

  const printBill = () => {
    if (!detail) return;
    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) {
      toast.error('Allow pop-ups to print the bill.');
      return;
    }
    const rows = detail.bill.lines.map(line => `<tr><td>${escapeHtml(line.nameJa || line.nameEn)}</td><td class="r">${line.quantity}</td><td class="r">${yen(line.lineTotal)}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bill table ${escapeHtml(detail.tableNumber)}</title><style>
      @page { size: 80mm auto; margin: 4mm; } body { font-family: system-ui, sans-serif; width: 72mm; margin: 0; font-size: 13px; }
      h1 { font-size: 18px; text-align: center; margin: 0 0 4px; } p { margin: 2px 0; text-align: center; } table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      td { padding: 3px 0; border-bottom: 1px dashed #999; } .r { text-align: right; } .t td { border: none; font-weight: 700; font-size: 15px; }
    </style></head><body><h1>${escapeHtml(shopName)}</h1><p>テーブル ${escapeHtml(detail.tableNumber)} · ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
      <table>${rows}<tr><td colspan="2">小計（税抜）</td><td class="r">${yen(detail.bill.subtotal)}</td></tr><tr><td colspan="2">消費税</td><td class="r">${yen(detail.bill.tax)}</td></tr><tr class="t"><td colspan="2">合計（税込）</td><td class="r">${yen(detail.bill.total)}</td></tr></table>
      <p>ありがとうございました</p></body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  if (!detail) return <Drawer onClose={onClose}><p>Loading…</p></Drawer>;
  const openCalls = detail.calls.filter(call => !call.resolvedAt);
  const seated = Math.max(0, Math.round((loadedAt - new Date(detail.openedAt).getTime()) / 60_000));
  const alerts = detail.members.filter(member => member.dietaryAlert);

  return (
    <Drawer onClose={onClose} title={`Table ${detail.tableNumber}`}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', color: '#4b5563', fontSize: '0.9rem' }}>
        <GuestsEditor guests={detail.guests} onSave={guests => run(() => apiFetch(`/api/v1/dining/sessions/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guests }) }), 'Guests updated.', 'Could not update guests.')} />
        <span>Seated {time(detail.openedAt)} ({seated} min)</span>
        {detail.status === 'BILL_REQUESTED' && <span style={pill('#fef3c7', '#92400e')}>Bill requested</span>}
      </div>

      {openCalls.length > 0 && (
        <section style={{ ...box, background: '#fef2f2', borderColor: '#fecaca' }}>
          {openCalls.map(call => (
            <div key={call.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '4px 0' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#991b1b' }}>
                {call.type === 'WATER' ? <Droplets size={16} /> : call.type === 'BILL' ? <Receipt size={16} /> : <BellRing size={16} />}
                {CALL_LABEL[call.type]} · {time(call.createdAt)}
              </span>
              <button type="button" disabled={busy} onClick={() => run(() => post(`/sessions/${detail.id}/calls/resolve`, { callId: call.id }), 'Done.', 'Could not update.')} style={smallBtn}>Done</button>
            </div>
          ))}
        </section>
      )}

      {alerts.map(member => (
        <div key={member.id} role="note" style={{ ...box, background: '#7f1d1d', color: '#fff', fontWeight: 700, borderColor: '#7f1d1d' }}>⚠ {member.name}: {alertText(member.dietaryAlert!)}</div>
      ))}

      <section>
        <div style={headRow}>
          <h3 style={h3}>Orders ({detail.orders.length})</h3>
          <button type="button" onClick={() => setAdding(true)} style={smallBtn}><Plus size={14} /> Add order</button>
        </div>
        {detail.orders.length === 0 && <p style={{ color: '#6b7280', margin: 0 }}>No orders yet.</p>}
        {detail.orders.map(order => {
          const next = NEXT[order.status];
          return (
            <article key={order.id} style={{ ...box, opacity: order.status === 'CANCELLED' ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong>#{formatOrderNumber(order.number)}</strong>
                <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{time(order.createdAt)}{order.placedBy === 'STAFF' ? ' · by staff' : ''}</span>
                <span style={{ ...pill(STATUS[order.status].bg, STATUS[order.status].color), marginLeft: 'auto' }}>{STATUS[order.status].label}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0' }}>
                {order.items.map((line, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '2px 0' }}>
                    <span><strong>{line.quantity}×</strong> {line.nameJa || line.nameEn}</span><span>{yen(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              {order.note && <div style={{ background: '#fffbeb', padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem' }}>📝 {order.note}</div>}
              {(next || order.status === 'NEW' || order.status === 'CONFIRMED') && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  {next && <button type="button" disabled={busy} onClick={() => moveOrder(order.id, next.status)} style={{ ...smallBtn, background: '#111827', color: '#fff', border: 'none', flex: 1 }}>{next.label}</button>}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => window.confirm(`Cancel order #${formatOrderNumber(order.number)}? It will be taken off the bill.`) && moveOrder(order.id, 'CANCELLED')}
                    style={{ ...smallBtn, color: '#b91c1c' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section style={box}>
        <div style={headRow}>
          <h3 style={h3}>Bill</h3>
          <button type="button" onClick={printBill} style={smallBtn} disabled={detail.bill.lines.length === 0}><Printer size={14} /> Print</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <tbody>
            {detail.bill.lines.map((line, i) => (
              <tr key={i}><td style={td}>{line.nameJa || line.nameEn}</td><td style={{ ...td, textAlign: 'right' }}>{line.quantity}</td><td style={{ ...td, textAlign: 'right' }}>{yen(line.lineTotal)}</td></tr>
            ))}
            <tr><td style={td} colSpan={2}>Subtotal (excl. tax)</td><td style={{ ...td, textAlign: 'right' }}>{yen(detail.bill.subtotal)}</td></tr>
            <tr><td style={td} colSpan={2}>Tax</td><td style={{ ...td, textAlign: 'right' }}>{yen(detail.bill.tax)}</td></tr>
            <tr><td style={{ ...td, fontWeight: 700, fontSize: '1.1rem', border: 'none' }} colSpan={2}>Total</td><td style={{ ...td, textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', border: 'none' }}>{yen(detail.bill.total)}</td></tr>
          </tbody>
        </table>
      </section>

      {detail.bill.inProgress > 0 ? (
        <p style={{ ...box, background: '#fff7ed', borderColor: '#fed7aa', margin: 0, fontSize: '0.9rem' }}>
          {detail.bill.inProgress} order{detail.bill.inProgress === 1 ? ' is' : 's are'} still being prepared. The table can be closed once everything is served (or cancelled).
        </p>
      ) : detail.bill.ready > 0 ? (
        <button type="button" disabled={busy} onClick={serveAllReady} style={{ ...bigBtn, background: '#065f46' }}><CheckCircle2 size={18} /> Mark {detail.bill.ready} ready order{detail.bill.ready === 1 ? '' : 's'} as served</button>
      ) : paying ? (
        <section style={box}>
          <h3 style={h3}>Payment received — {yen(detail.bill.total)}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
            {PAYMENTS.map(method => (
              <button
                key={method.value}
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await run(() => post(`/sessions/${detail.id}/close`, { paymentMethod: method.value }), `Table ${detail.tableNumber} closed · ${yen(detail.bill.total)} (${method.label}).`, 'Could not close the table.')) onClose();
                }}
                style={{ ...bigBtn, background: '#111827' }}
              >
                {method.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPaying(false)} style={{ ...smallBtn, marginTop: '8px' }}>Back</button>
        </section>
      ) : (
        <button type="button" disabled={busy} onClick={() => setPaying(true)} style={bigBtn}><Receipt size={18} /> Take payment &amp; close table</button>
      )}

      {adding && <StaffOrder sessionId={detail.id} onClose={() => setAdding(false)} onPlaced={() => { setAdding(false); load(); onChanged(); }} />}
    </Drawer>
  );
}

function GuestsEditor({ guests, onSave }: { guests: number | null; onSave: (guests: number) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <Users size={16} />
      <button type="button" aria-label="One guest fewer" style={iconBtn} onClick={() => onSave(Math.max(1, (guests ?? 1) - 1))}><Minus size={14} /></button>
      <strong>{guests ?? '–'}</strong> guests
      <button type="button" aria-label="One more guest" style={iconBtn} onClick={() => onSave(Math.min(50, (guests ?? 0) + 1))}><Plus size={14} /></button>
    </span>
  );
}

/** Staff take an order at the table, e.g. for guests without a phone. */
function StaffOrder({ sessionId, onClose, onPlaced }: { sessionId: string; onClose: () => void; onPlaced: () => void }) {
  const [menu, setMenu] = useState<MenuGroup[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/dining/menu').then(res => res.json()).then(setMenu).catch(() => toast.error('Could not load the menu.'));
  }, []);

  const all = menu.flatMap(group => group.items);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((sum, [id, q]) => sum + (all.find(item => item.id === id)?.price ?? 0) * q, 0);
  const set = (id: string, quantity: number) => setCart(prev => {
    const next = { ...prev };
    if (quantity > 0) next[id] = Math.min(20, quantity);
    else delete next[id];
    return next;
  });
  const matches = (item: { nameEn: string; nameJa: string | null }) => !query || `${item.nameEn} ${item.nameJa ?? ''}`.toLowerCase().includes(query.toLowerCase());

  const submit = async () => {
    setSending(true);
    try {
      const res = await apiFetch(`/api/v1/dining/sessions/${sessionId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: Object.entries(cart).map(([itemId, quantity]) => ({ itemId, quantity })), note: note.trim() || null }),
      });
      if (res.ok) {
        toast.success('Order sent to the kitchen.');
        onPlaced();
      } else toast.error(await errorMessage(res, 'Could not place the order.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Add order" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '520px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...headRow, padding: '1rem 1.25rem 0.5rem' }}>
          <h3 style={h3}>Add order</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '0 1.25rem' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search dishes" style={input} />
        </div>
        <div style={{ overflowY: 'auto', padding: '0.5rem 1.25rem', flex: 1 }}>
          {menu.map(group => {
            const items = group.items.filter(matches);
            if (items.length === 0) return null;
            return (
              <div key={group.id}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '10px 0 4px' }}>{group.nameEn}</div>
                {items.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f3f4f6', opacity: item.isSoldOut ? 0.5 : 1 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{item.nameJa || item.nameEn}<span style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280' }}>{item.nameEn} · {yen(item.price)}</span></span>
                    {item.isSoldOut ? <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Sold out</span> : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button type="button" aria-label="Less" style={iconBtn} onClick={() => set(item.id, (cart[item.id] ?? 0) - 1)} disabled={!cart[item.id]}><Minus size={14} /></button>
                        <strong style={{ minWidth: '18px', textAlign: 'center' }}>{cart[item.id] ?? 0}</strong>
                        <button type="button" aria-label="More" style={iconBtn} onClick={() => set(item.id, (cart[item.id] ?? 0) + 1)}><Plus size={14} /></button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ padding: '0.75rem 1.25rem 1.25rem', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note for the kitchen (optional)" maxLength={300} style={input} />
          <button type="button" disabled={sending || count === 0} onClick={submit} style={bigBtn}>{sending ? 'Sending…' : `Send ${count} item${count === 1 ? '' : 's'} to kitchen · ${yen(total)}`}</button>
        </div>
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title ?? 'Table'} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 480px)', height: '100%', background: '#f9fafb', overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '12px', boxSizing: 'border-box' }}>
        <div style={headRow}>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const pill = (bg: string, color: string): CSSProperties => ({ padding: '2px 10px', borderRadius: '9999px', background: bg, color, fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' });
const box: CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.75rem 0.9rem', marginBottom: '8px' };
const headRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' };
const h3: CSSProperties = { margin: 0, fontSize: '1rem' };
const td: CSSProperties = { padding: '4px 0', borderBottom: '1px solid #f3f4f6' };
const smallBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' };
const bigBtn: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', minHeight: '48px', border: 'none', borderRadius: '10px', background: '#b5451b', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' };
const iconBtn: CSSProperties = { width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #d1d5db', background: '#fff', display: 'inline-grid', placeItems: 'center', cursor: 'pointer' };
const input: CSSProperties = { width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', fontSize: '0.95rem' };
