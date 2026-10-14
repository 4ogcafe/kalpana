import crypto from 'node:crypto';
import express from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { isSquareConfigured, squareFetch, yenToAmount } from '../lib/square.js';
import { objectIdString } from '../lib/schemas.js';
import { requireStaff } from '../middleware/auth.js';

// Square payment integration for the cash register:
//   • Payment links — generate a URL the customer pays on their phone (QR shown on counter screen)
//   • Terminal checkouts — push a payment request to a Square card reader on the counter
// The frontend polls for completion; the webhook route provides an optional push alternative.

const router = express.Router();

const linkSchema = z.object({
  sessionId: objectIdString,
  amount: z.number().int().positive().max(10_000_000),
  label: z.string().trim().min(1).max(100).optional(),
});

const terminalSchema = z.object({
  sessionId: objectIdString,
  amount: z.number().int().positive().max(10_000_000),
  deviceId: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(100).optional(),
});

function squareRequired() {
  if (!isSquareConfigured()) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square is not configured on this server.');
}

// ── Config ──────────────────────────────────────────────────────────────────

router.get('/config', requireStaff, (_req, res) => {
  res.json({
    configured: isSquareConfigured(),
    environment: config.square.environment,
    locationId: isSquareConfigured() ? config.square.locationId : null,
  });
});

// ── Payment links (QR) ──────────────────────────────────────────────────────

/**
 * Create a Square payment link. Returns the checkout URL, a base64 QR image
 * (generated server-side), and the Square order ID for polling.
 */
router.post('/payment-link', requireStaff, async (req, res) => {
  squareRequired();
  const { sessionId, amount, label } = linkSchema.parse(req.body);

  const data = await squareFetch<{
    payment_link: { id: string; url: string };
    related_resources?: { orders?: { id: string }[] };
  }>('POST', '/online-checkout/payment-links', {
    idempotency_key: crypto.randomUUID(),
    quick_pay: {
      name: label ?? 'Kalpana Restaurant',
      price_money: { amount: yenToAmount(amount), currency: 'JPY' },
      location_id: config.square.locationId,
    },
    payment_note: `Session ${sessionId}`,
  });

  const url = data.payment_link?.url ?? '';
  const orderId = data.related_resources?.orders?.[0]?.id ?? null;

  // Generate QR code image server-side so the frontend needs no extra library.
  const qrDataUrl = url
    ? await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#1a1814', light: '#ffffff' } })
    : null;

  res.json({ linkId: data.payment_link.id, url, orderId, qrDataUrl });
});

/** Poll whether a Square payment link's order has been paid. */
router.get('/payment-link/:orderId/status', requireStaff, async (req, res) => {
  squareRequired();
  const data = await squareFetch<{ order?: { state: string } }>(
    'GET',
    `/orders/${encodeURIComponent(String(req.params.orderId))}`,
  );
  const state = data.order?.state ?? 'OPEN';
  res.json({ state, paid: state === 'COMPLETED' });
});

// ── Terminal checkouts ───────────────────────────────────────────────────────

/** Push a payment to a paired Square Terminal card reader. */
router.post('/terminal/checkout', requireStaff, async (req, res) => {
  squareRequired();
  const { sessionId, amount, deviceId, label } = terminalSchema.parse(req.body);

  const data = await squareFetch<{ checkout?: { id: string; status: string } }>(
    'POST',
    '/terminals/checkouts',
    {
      idempotency_key: crypto.randomUUID(),
      checkout: {
        amount_money: { amount: yenToAmount(amount), currency: 'JPY' },
        reference_id: sessionId,
        note: label ?? 'Kalpana Restaurant',
        device_options: { device_id: deviceId, skip_receipt_screen: false },
      },
    },
  );

  res.json({ checkoutId: data.checkout?.id, status: data.checkout?.status });
});

/** Poll a terminal checkout's status. */
router.get('/terminal/checkout/:checkoutId/status', requireStaff, async (req, res) => {
  squareRequired();
  const data = await squareFetch<{ checkout?: { status: string } }>(
    'GET',
    `/terminals/checkouts/${encodeURIComponent(String(req.params.checkoutId))}`,
  );
  const status = data.checkout?.status ?? 'PENDING';
  res.json({
    status,
    paid: status === 'COMPLETED',
    cancelled: status === 'CANCELED' || status === 'CANCEL_REQUESTED',
  });
});

/** Cancel a terminal checkout (customer walked away). */
router.post('/terminal/checkout/:checkoutId/cancel', requireStaff, async (req, res) => {
  squareRequired();
  await squareFetch('POST', `/terminals/checkouts/${encodeURIComponent(String(req.params.checkoutId))}/cancel`);
  res.json({ success: true });
});

/** List paired Square Terminal devices so the cashier can pick one. */
router.get('/terminal/devices', requireStaff, async (_req, res) => {
  if (!isSquareConfigured()) return res.json({ devices: [] });

  const data = await squareFetch<{ devices?: { id: string; name?: string; status?: { category?: string }; attributes?: { model?: string } }[] }>(
    'GET',
    '/devices',
  );

  const devices = (data.devices ?? []).map(d => ({
    id: d.id,
    name: d.name ?? d.id,
    status: d.status?.category ?? 'UNKNOWN',
    model: d.attributes?.model ?? null,
  }));
  res.json({ devices });
});

// ── Webhook ──────────────────────────────────────────────────────────────────

/**
 * Square webhook handler (optional — the frontend also polls).
 * Register this URL in your Square Developer Dashboard → Webhooks.
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sigKey = config.square.webhookSignatureKey;
    if (sigKey) {
      const sig = req.headers['x-square-hmacsha256-signature'] as string | undefined;
      const body = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', sigKey).update(body).digest('base64');
      if (!sig || sig !== expected) {
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }
    }
    // Acknowledge immediately; the frontend polls for completion.
    res.json({ ok: true });
  },
);

export default router;
