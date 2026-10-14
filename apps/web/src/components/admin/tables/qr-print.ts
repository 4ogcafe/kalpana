import qrcode from 'qrcode-generator';
import { getPublic } from '../../../lib/api';

// Printable QR cards for the tables: one card per table, sized to cut out and put in a stand.

// The standard 4-module white border; less makes some phone cameras miss the code.
const QUIET_ZONE = 4;

const FALLBACK_NAME = 'カルパナ Kalpana';

/** The restaurant's name as set in Restaurant Settings, for printouts. */
export async function restaurantName(): Promise<string> {
  try {
    const settings = await getPublic<{ name?: string }>('/api/v1/settings');
    return settings.name?.trim() || FALLBACK_NAME;
  } catch {
    return FALLBACK_NAME;
  }
}

const isLocalHost = (host: string) => /^(localhost|127\.|\[?::1\]?$)/.test(host);

/** True when this admin page is open as "localhost", which phones can't reach. */
export const adminIsLocal = () => isLocalHost(window.location.hostname);

/**
 * The website address the QR codes open: the saved site address, else this page's own address —
 * except "localhost", which on a phone means the phone itself, so the computer's network address is used.
 */
export function qrBase(siteUrl: string | null, lanAddresses: string[]): string {
  if (siteUrl) return siteUrl.replace(/\/$/, '');
  if (adminIsLocal() && lanAddresses.length > 0) {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//${lanAddresses[0]}${port}`;
  }
  return window.location.origin;
}

export const tableUrl = (base: string, qrToken: string) => `${base}/t/${qrToken}`;

/** The QR code as an SVG string (dark modules as one path). */
export function qrSvg(text: string, size = 220): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const total = count + QUIET_ZONE * 2;
  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE},${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/** Opens the print dialog with a card for each table. Returns false if pop-ups are blocked. */
export function printTableCards(tables: { number: string; name: string | null; qrToken: string }[], base: string, restaurant = FALLBACK_NAME): boolean {
  const win = window.open('', '_blank', 'width=900,height=900');
  if (!win) return false;
  const cards = tables
    .map(
      table => `<div class="card">
        <div class="brand">${escapeHtml(restaurant)}</div>
        <div class="num">テーブル <b>${escapeHtml(table.number)}</b></div>
        ${table.name ? `<div class="name">${escapeHtml(table.name)}</div>` : ''}
        ${qrSvg(tableUrl(base, table.qrToken))}
        <div class="ja">スマートフォンで読み取って<br>ご注文ください</div>
        <div class="en">Scan to see the menu and order · Table ${escapeHtml(table.number)}</div>
      </div>`,
    )
    .join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Table QR codes</title><style>
    @page { size: A4; margin: 10mm; }
    body { font-family: system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif; margin: 0; color: #111; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
    .card { border: 1.5px dashed #999; border-radius: 6mm; padding: 6mm; text-align: center; break-inside: avoid; display: flex; flex-direction: column; align-items: center; gap: 2mm; }
    .brand { font-size: 13px; letter-spacing: 2px; color: #b5451b; font-weight: 700; }
    .num { font-size: 20px; } .num b { font-size: 34px; }
    .name { font-size: 13px; color: #555; }
    svg { width: 58mm; height: 58mm; }
    .ja { font-size: 14px; font-weight: 700; line-height: 1.5; }
    .en { font-size: 10px; color: #666; }
  </style></head><body><div class="grid">${cards}</div></body></html>`);
  win.document.close();
  win.focus();
  // Give the browser a moment to lay out the SVGs before printing.
  setTimeout(() => win.print(), 300);
  return true;
}
