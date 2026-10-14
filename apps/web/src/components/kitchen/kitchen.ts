import type { DietaryAlert } from '../admin/dietary';

// Shapes and pure helpers for the kitchen display (/kitchen).

export type KitchenStatus = 'NEW' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type ActiveStatus = 'NEW' | 'CONFIRMED' | 'READY';

export interface KitchenLine {
  itemId: string;
  nameEn: string;
  nameJa: string | null;
  quantity: number;
  doneAt?: string | null;
}

export interface KitchenOrder {
  id: string;
  number: number;
  status: KitchenStatus;
  fulfillment?: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  tableNumber?: string | null;
  customerName: string;
  phone: string;
  note: string | null;
  pickupAt: string;
  createdAt: string;
  confirmedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt: string;
  items: KitchenLine[];
  customerId?: string | null;
  reward?: { titleJa: string; kind: 'AMOUNT_OFF' | 'PERK' } | null;
  deliveryAddress?: { postalCode: string; prefecture: string; city: string; line1: string; building?: string } | null;
  grandTotal?: number;
  total: number;
  dietaryAlert?: DietaryAlert | null;
}

export interface KitchenBoard {
  serverTime: string;
  pausedUntil: string | null;
  ordering: { pickup: { enabled: boolean }; delivery: { enabled: boolean } };
  active: KitchenOrder[];
  done: KitchenOrder[];
  stats: { ordersToday: number; completedToday: number; cancelledToday: number; itemsToday: number; avgPrepMinutes: number | null };
}

export const TIMEZONE = 'Asia/Tokyo';

export const COLUMNS: { status: ActiveStatus; title: string; sub: string }[] = [
  { status: 'NEW', title: '新規', sub: 'New' },
  { status: 'CONFIRMED', title: '調理中', sub: 'Cooking' },
  { status: 'READY', title: '完成', sub: 'Ready' },
];

/** Minutes a ready-to-collect order is "soon" before it turns amber. */
export const SOON_MINUTES = 15;

export const isDelivery = (order: KitchenOrder) => order.fulfillment === 'DELIVERY';
export const isDineIn = (order: KitchenOrder) => order.fulfillment === 'DINE_IN';

/** "🍽 Table 5", "🛵 Delivery" or "🛍 Pickup". */
export const typeLabel = (order: KitchenOrder) => (isDineIn(order) ? `🍽 Table ${order.tableNumber ?? '?'}` : isDelivery(order) ? '🛵 Delivery' : '🛍 Pickup');

export const clockTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('ja-JP', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });

/** "today" or "10/14 (水)" for orders due on another day. */
export function dueDay(iso: string, now: number): string | null {
  const key = (time: number | string) => new Date(time).toLocaleDateString('ja-JP', { timeZone: TIMEZONE });
  if (key(iso) === key(now)) return null;
  return new Date(iso).toLocaleDateString('ja-JP', { timeZone: TIMEZONE, month: 'numeric', day: 'numeric', weekday: 'short' });
}

// Never negative: the screen's clock can be a few seconds behind the server's.
export const minutesBetween = (from: string | number, to: number) => Math.max(0, Math.floor((to - new Date(from).getTime()) / 60_000));

export type Urgency = 'late' | 'soon' | 'ok';

/** How close the order is to its pickup / delivery time. Finished orders are never urgent. */
export function urgency(order: KitchenOrder, now: number): Urgency {
  const left = (new Date(order.pickupAt).getTime() - now) / 60_000;
  if (left < 0) return 'late';
  if (left <= SOON_MINUTES) return 'soon';
  return 'ok';
}

/** "in 12 min", "5 min late", or "in 2 h 10 min". */
export function countdown(order: KitchenOrder, now: number): string {
  const minutes = Math.round((new Date(order.pickupAt).getTime() - now) / 60_000);
  if (minutes < 0) return `${-minutes} min late`;
  if (minutes === 0) return 'due now';
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The one forward step for each column, worded for pickup or delivery. */
export function nextAction(order: KitchenOrder): { status: KitchenStatus; label: string } | null {
  if (order.status === 'NEW') return { status: 'CONFIRMED', label: 'Start cooking' };
  if (order.status === 'CONFIRMED') return { status: 'READY', label: isDineIn(order) ? 'Ready to serve' : isDelivery(order) ? 'Ready for rider' : 'Ready' };
  if (order.status === 'READY') return { status: 'COMPLETED', label: isDineIn(order) ? 'Served' : isDelivery(order) ? 'Delivered' : 'Picked up' };
  return null;
}

/** Dishes still to make across the orders in the kitchen ("all day"), most first. */
export function allDayCounts(orders: KitchenOrder[]) {
  const counts = new Map<string, { nameEn: string; nameJa: string | null; quantity: number; orders: number }>();
  for (const order of orders) {
    if (order.status !== 'NEW' && order.status !== 'CONFIRMED') continue;
    for (const line of order.items) {
      if (line.doneAt) continue;
      const entry = counts.get(line.itemId) ?? { nameEn: line.nameEn, nameJa: line.nameJa, quantity: 0, orders: 0 };
      entry.quantity += line.quantity;
      entry.orders += 1;
      counts.set(line.itemId, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.quantity - a.quantity);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/** A kitchen ticket for an 80 mm receipt printer (or any printer). */
export function ticketHtml(order: KitchenOrder, allergyLine: string | null): string {
  const lines = order.items
    .map(line => `<tr><td class="q">${line.quantity}×</td><td>${escapeHtml(line.nameEn)}${line.nameJa ? `<br><small>${escapeHtml(line.nameJa)}</small>` : ''}</td></tr>`)
    .join('');
  const due = new Date(order.pickupAt).toLocaleString('ja-JP', { timeZone: TIMEZONE, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const address = order.deliveryAddress
    ? [order.deliveryAddress.postalCode && `〒${order.deliveryAddress.postalCode}`, order.deliveryAddress.prefecture, order.deliveryAddress.city, order.deliveryAddress.line1, order.deliveryAddress.building].filter(Boolean).join(' ')
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Order ${order.number}</title><style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: system-ui, sans-serif; width: 72mm; margin: 0; color: #000; }
    h1 { font-size: 28px; margin: 0; } .type { font-size: 16px; font-weight: 700; border: 2px solid #000; display: inline-block; padding: 2px 6px; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 16px; margin: 8px 0; } td { padding: 4px 0; border-bottom: 1px dashed #000; vertical-align: top; } .q { width: 36px; font-weight: 700; font-size: 18px; }
    .box { border: 2px solid #000; padding: 4px 6px; margin: 6px 0; font-weight: 700; } small { font-size: 12px; } p { margin: 2px 0; font-size: 14px; }
  </style></head><body>
    <h1>#${String(order.number).padStart(3, '0')}</h1>
    <div class="type">${isDineIn(order) ? `TABLE ${escapeHtml(order.tableNumber ?? '?')} 店内` : isDelivery(order) ? 'DELIVERY デリバリー' : 'PICKUP お持ち帰り'}</div>
    <p><b>Due: ${escapeHtml(due)}</b></p>
    <p>${escapeHtml(order.customerName)} · ${escapeHtml(order.phone)}</p>
    ${address ? `<p>${escapeHtml(address)}</p>` : ''}
    <table>${lines}</table>
    ${allergyLine ? `<div class="box">⚠ ${escapeHtml(allergyLine)}</div>` : ''}
    ${order.reward?.kind === 'PERK' ? `<div class="box">🎁 ${escapeHtml(order.reward.titleJa)}</div>` : ''}
    ${order.note ? `<div class="box">📝 ${escapeHtml(order.note)}</div>` : ''}
    <p><small>Printed ${new Date().toLocaleString('ja-JP', { timeZone: TIMEZONE })}</small></p>
  </body></html>`;
}

/** Prints one ticket from a blank window (no inline script, so the site's security policy still applies). */
export function printTicket(order: KitchenOrder, allergyLine: string | null): boolean {
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) return false;
  win.document.write(ticketHtml(order, allergyLine));
  win.document.close();
  win.focus();
  win.print();
  win.close();
  return true;
}
