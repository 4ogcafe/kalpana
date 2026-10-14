import crypto from 'node:crypto';
import { z } from 'zod';

// Dine-in ordering: a QR code on each table opens that table's menu; guests order in rounds and pay
// one bill at the register. Pure helpers only (no req/res, no database).

export const DEFAULT_DINE_IN_TARGET_MINUTES = 20;
export const TABLE_CALL_TYPES = ['STAFF', 'WATER', 'BILL'] as const;
export type TableCallType = (typeof TABLE_CALL_TYPES)[number];
export const PAYMENT_METHODS = ['CASH', 'CARD', 'QR', 'OTHER'] as const;

export interface DiningSettings {
  diningEnabled?: boolean | null;
  /** When on, the first scan opens the table; when off, staff open each table for its guests. */
  diningSelfOpen?: boolean | null;
  /** Minutes the kitchen aims to serve a dine-in order in (drives the kitchen countdown). */
  diningTargetMinutes?: number | null;
}

export const diningConfig = (settings: DiningSettings) => ({
  enabled: Boolean(settings.diningEnabled),
  selfOpen: Boolean(settings.diningSelfOpen),
  targetMinutes: settings.diningTargetMinutes ?? DEFAULT_DINE_IN_TARGET_MINUTES,
});

/** "1", "12", "A3", "テラス2": short, printable, and safe in a URL path. */
export const tableSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[\p{L}\p{N}-]+$/u, 'Use letters, numbers or a dash'),
  name: z.string().trim().max(40).nullable().optional(),
  seats: z.number().int().min(1).max(50).optional(),
  area: z.string().trim().max(30).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

/** The code in a table's QR link. Unguessable, so a table can't be ordered from by trying numbers. */
export const newQrToken = () => crypto.randomBytes(12).toString('base64url');
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16}$/;

interface CategoryLike {
  _id?: { toString(): string };
  parentId?: { toString(): string } | null;
  nameEn?: unknown;
  nameJa?: unknown;
  /** Set in Menu Management: true = on the table menu, false = not; unset = automatic. */
  dineIn?: boolean | null;
}

const looksTakeout = (category: CategoryLike) =>
  /takeout|take-out|take out/i.test(String(category.nameEn ?? '')) || /テイクアウト|持ち帰り/.test(String(category.nameJa ?? ''));

/**
 * Whether a category's dishes are offered on the table QR menu. The admin's choice wins; a category
 * without one follows its parent; at the top, takeout-only categories ("Lunch Takeout", "テイクアウト")
 * are left off automatically.
 */
export function isDineInCategory(category: object | null | undefined, byId: Map<string, object> = new Map()): boolean {
  const seen = new Set<string>();
  for (let current = category as CategoryLike | undefined; current; ) {
    if (typeof current.dineIn === 'boolean') return current.dineIn;
    if (looksTakeout(current)) return false;
    const parentKey = current.parentId ? String(current.parentId) : null;
    if (!parentKey || seen.has(parentKey)) return true;
    seen.add(parentKey);
    current = byId.get(parentKey) as CategoryLike | undefined;
  }
  return true;
}

export interface BillOrder {
  status: string;
  total?: number | null;
  tax?: number | null;
  grandTotal?: number | null;
  items?: { nameEn?: string; nameJa?: string | null; quantity?: number; unitPrice?: number; lineTotal?: number; itemId?: unknown }[];
}

/** The table's bill: every order except cancelled ones, with lines of the same dish combined. */
export function tableBill(documents: readonly object[]) {
  const orders = documents as BillOrder[];
  const counted = orders.filter((order) => order.status !== 'CANCELLED');
  const lines = new Map<string, { nameEn: string; nameJa: string | null; unitPrice: number; quantity: number; lineTotal: number }>();
  for (const order of counted) {
    for (const line of order.items ?? []) {
      const key = `${String(line.itemId ?? line.nameEn)}:${line.unitPrice ?? 0}`;
      const entry = lines.get(key) ?? { nameEn: line.nameEn ?? '', nameJa: line.nameJa ?? null, unitPrice: Number(line.unitPrice) || 0, quantity: 0, lineTotal: 0 };
      entry.quantity += Number(line.quantity) || 0;
      entry.lineTotal += Number(line.lineTotal) || 0;
      lines.set(key, entry);
    }
  }
  const subtotal = counted.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const tax = counted.reduce((sum, order) => sum + (Number(order.tax) || 0), 0);
  return {
    lines: [...lines.values()],
    orders: counted.length,
    subtotal,
    tax,
    total: counted.reduce((sum, order) => sum + (Number(order.grandTotal ?? order.total) || 0), 0),
    inProgress: counted.filter((order) => order.status === 'NEW' || order.status === 'CONFIRMED').length,
    ready: counted.filter((order) => order.status === 'READY').length,
  };
}
