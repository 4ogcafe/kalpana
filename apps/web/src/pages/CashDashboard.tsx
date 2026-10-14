import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  CircleAlert, Banknote, CircleCheck, ChefHat, ChevronRight,
  Clock, CreditCard, LogOut, Monitor, Ellipsis, QrCode, RefreshCw, ScanLine, Users, X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import './cash.css';

const POLL_MS = 8_000;
const STATS_POLL_MS = 30_000;
const SQUARE_POLL_MS = 3_000;
const TZ = 'Asia/Tokyo';

const PAYMENT_METHODS = ['CASH', 'CARD', 'QR', 'OTHER'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PM_LABEL: Record<PaymentMethod, string> = { CASH: '現金', CARD: 'カード', QR: 'QR払い', OTHER: 'その他' };
const PM_ICONS = { CASH: Banknote, CARD: CreditCard, QR: QrCode, OTHER: Ellipsis };

// ---- Square types ----

interface SquareConfig {
  configured: boolean;
  environment: 'sandbox' | 'production';
  locationId: string | null;
}

interface SquareDevice {
  id: string;
  name: string;
  status: string;
  model: string | null;
}

type SquareMode = 'qr' | 'terminal';

interface SquareQRState {
  mode: 'qr';
  linkId: string;
  url: string;
  orderId: string | null;
  qrDataUrl: string | null;
}

interface SquareTerminalState {
  mode: 'terminal';
  checkoutId: string;
  status: string;
}

type SquareActiveState = SquareQRState | SquareTerminalState | null;

const ORDER_STATUS_JA: Record<string, string> = {
  NEW: '受付',
  CONFIRMED: '調理中',
  READY: '完成',
  COMPLETED: '提供済',
  CANCELLED: 'キャンセル',
};

function yen(n: number) { return `¥${n.toLocaleString('ja-JP')}`; }

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function relativeTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'たった今';
  if (mins < 60) return `${mins}分前`;
  return `${Math.floor(mins / 60)}h${mins % 60}m前`;
}

/** Round up to a handful of nice cash amounts to offer as quick buttons. */
function quickAmounts(total: number): number[] {
  const ceil = (n: number, step: number) => Math.ceil(n / step) * step;
  const candidates = [
    ceil(total, 100),
    ceil(total, 500),
    ceil(total, 1000),
    ceil(total, 1000) + 500,
    (Math.floor(total / 1000) + 2) * 1000,
  ];
  return [...new Set(candidates)].filter(a => a >= total).sort((a, b) => a - b).slice(0, 5);
}

// ---- Interfaces ----

interface SessionSummary {
  id: string;
  status: 'OPEN' | 'BILL_REQUESTED';
  guests: number | null;
  openedAt: string;
  lastOrderAt: string | null;
  calls: { id: string; type: string; createdAt: string }[];
  orders: number;
  inProgress: number;
  ready: number;
  total: number;
}

interface TableRow {
  id: string;
  number: string;
  name: string | null;
  seats: number | null;
  area: string | null;
  isActive: boolean;
  session: SessionSummary | null;
}

interface OrderItem {
  nameEn: string;
  nameJa: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  options?: { nameJa: string }[];
}

interface SessionOrder {
  id: string;
  number: number;
  status: string;
  items: OrderItem[];
  total: number;
  tax: number | null;
  grandTotal: number | null;
  createdAt: string;
  note: string | null;
}

interface BillLine {
  nameEn: string;
  nameJa: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

interface SessionDetail {
  id: string;
  tableNumber: string;
  status: string;
  guests: number | null;
  openedAt: string;
  orders: SessionOrder[];
  bill: {
    lines: BillLine[];
    orders: number;
    subtotal: number;
    tax: number;
    total: number;
    inProgress: number;
    ready: number;
  };
}

interface TodayStats {
  totalRevenue: number;
  sessionCount: number;
  avgPerSession: number;
  breakdown: Record<string, { count: number; total: number }>;
}

// ---- Component ----

export default function CashDashboard() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [paying, setPaying] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [lastPaid, setLastPaid] = useState<{ tableNumber: string; total: number; method: string } | null>(null);
  const prevTables = useRef<TableRow[]>([]);
  const lastPaidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Square state
  const [squareCfg, setSquareCfg] = useState<SquareConfig | null>(null);
  const [squareDevices, setSquareDevices] = useState<SquareDevice[]>([]);
  const [squareMode, setSquareMode] = useState<SquareMode>('qr');
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [squareActive, setSquareActive] = useState<SquareActiveState>(null);
  const [squarePaying, setSquarePaying] = useState(false);
  const squarePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch('/api/v1/auth/me')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!d.user || d.user.role === 'KITCHEN') navigate('/login'); })
      .catch(() => navigate('/login'));
  }, [navigate]);

  const loadTables = useCallback(async () => {
    const res = await apiFetch('/api/v1/dining/tables').catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    const rows: TableRow[] = data.tables ?? [];
    // Ring if a table newly requested the bill
    const prev = new Set(prevTables.current.filter(t => t.session?.status === 'BILL_REQUESTED').map(t => t.session!.id));
    for (const t of rows) {
      if (t.session?.status === 'BILL_REQUESTED' && !prev.has(t.session.id)) {
        playChime();
        toast.success(`Table ${t.number} — 会計のご依頼`, { duration: 8000 });
      }
    }
    prevTables.current = rows;
    setTables(rows);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await apiFetch('/api/v1/dining/cash/today').catch(() => null);
    if (!res?.ok) return;
    setTodayStats(await res.json());
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const res = await apiFetch(`/api/v1/dining/sessions/${id}`).catch(() => null);
    setLoadingDetail(false);
    if (!res?.ok) return;
    setDetail(await res.json());
  }, []);

  useEffect(() => {
    loadTables();
    loadStats();
    const t1 = setInterval(loadTables, POLL_MS);
    const t2 = setInterval(loadStats, STATS_POLL_MS);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [loadTables, loadStats]);

  // Load Square config once on mount
  useEffect(() => {
    apiFetch('/api/v1/square/config')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setSquareCfg(d); })
      .catch(() => null);
  }, []);

  // Refresh detail whenever the table list re-polls (order statuses may have changed).
  // Include inProgress/ready so the blocked flag stays accurate when the kitchen updates orders.
  const tablesKey = tables.map(t => `${t.session?.id}:${t.session?.status}:${t.session?.total}:${t.session?.inProgress}:${t.session?.ready}`).join('|');
  useEffect(() => {
    if (selectedId && !paying) loadDetail(selectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey]);

  const showPaidConfirmation = useCallback((tableNumber: string, total: number, method: string) => {
    if (lastPaidTimer.current) clearTimeout(lastPaidTimer.current);
    setLastPaid({ tableNumber, total, method });
    // Auto-clear after 8 seconds
    lastPaidTimer.current = setTimeout(() => setLastPaid(null), 8_000);
  }, []);

  const selectTable = (sessionId: string) => {
    if (sessionId === selectedId) return;
    stopSquarePoll();
    setSquareActive(null);
    setLastPaid(null);
    if (lastPaidTimer.current) clearTimeout(lastPaidTimer.current);
    setSelectedId(sessionId);
    setDetail(null);
    setPaymentMethod('CASH');
    setCashReceived('');
    loadDetail(sessionId);
  };

  // Load terminal devices when user switches to terminal mode on CARD payment
  const loadDevices = useCallback(async () => {
    const res = await apiFetch('/api/v1/square/terminal/devices').catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    setSquareDevices(d.devices ?? []);
    if (d.devices?.length > 0 && !selectedDevice) setSelectedDevice(d.devices[0].id);
  }, [selectedDevice]);

  // Stop any active Square polling
  const stopSquarePoll = useCallback(() => {
    if (squarePollRef.current) { clearInterval(squarePollRef.current); squarePollRef.current = null; }
  }, []);

  // Called when Square detects a completed payment — close the session
  const onSquarePaid = useCallback(async (squarePaymentMethod: PaymentMethod) => {
    if (!detail) return;
    stopSquarePoll();
    try {
      const res = await apiFetch(`/api/v1/dining/sessions/${detail.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod: squarePaymentMethod, note: 'Square' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? err.message ?? '会計処理に失敗しました');
      }
      const { total } = await res.json();
      toast.success(`Table ${detail.tableNumber} — ${yen(total)} Square決済完了`);
      setSquareActive(null);
      setSelectedId(null);
      setDetail(null);
      showPaidConfirmation(detail.tableNumber, total, `Square (${squarePaymentMethod === 'CARD' ? 'カード' : 'QR'})`);
      await Promise.all([loadTables(), loadStats()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '会計処理に失敗しました');
    }
  }, [detail, loadTables, loadStats, stopSquarePoll, showPaidConfirmation]);

  // Start polling a Square QR order
  const startQRPoll = useCallback((orderId: string) => {
    stopSquarePoll();
    squarePollRef.current = setInterval(async () => {
      const res = await apiFetch(`/api/v1/square/payment-link/${orderId}/status`).catch(() => null);
      if (!res?.ok) return;
      const d = await res.json();
      if (d.paid) { onSquarePaid('QR'); }
    }, SQUARE_POLL_MS);
  }, [stopSquarePoll, onSquarePaid]);

  // Start polling a Square Terminal checkout
  const startTerminalPoll = useCallback((checkoutId: string) => {
    stopSquarePoll();
    squarePollRef.current = setInterval(async () => {
      const res = await apiFetch(`/api/v1/square/terminal/checkout/${checkoutId}/status`).catch(() => null);
      if (!res?.ok) return;
      const d = await res.json();
      if (d.paid) {
        onSquarePaid('CARD');
      } else if (d.cancelled) {
        stopSquarePoll();
        setSquareActive(null);
        toast.error('Square端末でキャンセルされました');
      } else {
        setSquareActive(prev => prev?.mode === 'terminal' ? { ...prev, status: d.status } : prev);
      }
    }, SQUARE_POLL_MS);
  }, [stopSquarePoll, onSquarePaid]);

  // Clean up polling when switching away
  useEffect(() => () => stopSquarePoll(), [stopSquarePoll]);

  // Square QR: generate payment link
  const handleSquareQR = async () => {
    if (!detail || !squareCfg?.configured) return;
    setSquarePaying(true);
    try {
      const res = await apiFetch('/api/v1/square/payment-link', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: detail.id,
          amount: detail.bill.total,
          label: `Table ${detail.tableNumber} – Kalpana`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? err.message ?? 'Square決済リンクの作成に失敗しました');
      }
      const data = await res.json();
      setSquareActive({ mode: 'qr', linkId: data.linkId, url: data.url, orderId: data.orderId, qrDataUrl: data.qrDataUrl });
      if (data.orderId) startQRPoll(data.orderId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Square QRの生成に失敗しました');
    } finally {
      setSquarePaying(false);
    }
  };

  // Square Terminal: push to card reader
  const handleSquareTerminal = async () => {
    if (!detail || !squareCfg?.configured || !selectedDevice) return;
    setSquarePaying(true);
    try {
      const res = await apiFetch('/api/v1/square/terminal/checkout', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: detail.id,
          amount: detail.bill.total,
          deviceId: selectedDevice,
          label: `Table ${detail.tableNumber} – Kalpana`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? err.message ?? 'Square端末への送信に失敗しました');
      }
      const data = await res.json();
      setSquareActive({ mode: 'terminal', checkoutId: data.checkoutId, status: data.status });
      startTerminalPoll(data.checkoutId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Square端末への送信に失敗しました');
    } finally {
      setSquarePaying(false);
    }
  };

  // Cancel an active Square terminal checkout
  const handleSquareCancel = async () => {
    if (squareActive?.mode !== 'terminal') return;
    stopSquarePoll();
    await apiFetch(`/api/v1/square/terminal/checkout/${squareActive.checkoutId}/cancel`, { method: 'POST' }).catch(() => null);
    setSquareActive(null);
  };

  const handlePay = async () => {
    if (!detail) return;
    setPaying(true);
    try {
      const res = await apiFetch(`/api/v1/dining/sessions/${detail.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod, note: null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? err.message ?? '会計処理に失敗しました');
      }
      const { total } = await res.json();
      toast.success(`Table ${detail.tableNumber} — ${yen(total)} 会計完了`);
      showPaidConfirmation(detail.tableNumber, total, PM_LABEL[paymentMethod]);
      setSelectedId(null);
      setDetail(null);
      await Promise.all([loadTables(), loadStats()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '会計処理に失敗しました');
    } finally {
      setPaying(false);
    }
  };

  // Derived
  const billTotal = detail?.bill.total ?? 0;
  const received = parseInt(cashReceived.replace(/\D/g, ''), 10) || 0;
  const change = received > 0 ? received - billTotal : null;
  const blocked = (detail?.bill.inProgress ?? 0) + (detail?.bill.ready ?? 0) > 0;
  const canPay = !blocked && (paymentMethod !== 'CASH' || received >= billTotal);

  const queue = tables
    .filter(t => t.session && t.isActive)
    .sort((a, b) => {
      const aR = a.session!.status === 'BILL_REQUESTED' ? 1 : 0;
      const bR = b.session!.status === 'BILL_REQUESTED' ? 1 : 0;
      if (aR !== bR) return bR - aR;
      return new Date(b.session!.openedAt).getTime() - new Date(a.session!.openedAt).getTime();
    });

  return (
    <div className="ca-root">
      <header className="ca-header">
        <div className="ca-header-left">
          <div className="ca-logo"><span>💴</span> レジ</div>
          {todayStats && (
            <div className="ca-today">
              <span className="ca-today-total">本日計 {yen(todayStats.totalRevenue)}</span>
              <span className="ca-today-count">{todayStats.sessionCount}組</span>
              {PAYMENT_METHODS.map(pm => {
                const b = todayStats.breakdown[pm];
                if (!b || b.count === 0) return null;
                return (
                  <span key={pm} className="ca-today-pill">
                    {PM_LABEL[pm]} {b.count} • {yen(b.total)}
                  </span>
                );
              })}
              {todayStats.sessionCount > 0 && (
                <span className="ca-today-avg">平均 {yen(todayStats.avgPerSession)}</span>
              )}
            </div>
          )}
        </div>
        <div className="ca-header-right">
          <a href="/kitchen" target="_blank" rel="noopener" className="ca-kitchen-link">
            <ChefHat size={16} /> キッチン ↗
          </a>
          <button
            className="ca-logout"
            onClick={() => { apiFetch('/api/v1/auth/logout', { method: 'POST' }); navigate('/login'); }}
          >
            <LogOut size={16} /> 退出
          </button>
        </div>
      </header>

      <main className="ca-main">
        {/* ── Left: queue ── */}
        <div className="ca-queue">
          <div className="ca-queue-head">
            テーブル
            {queue.length > 0 && <span className="ca-queue-cnt">{queue.length}</span>}
          </div>

          {queue.length === 0 ? (
            <div className="ca-queue-empty">
              <CircleCheck size={36} />
              <p>待ちのテーブルなし</p>
            </div>
          ) : (
            queue.map(table => {
              const s = table.session!;
              const isBill = s.status === 'BILL_REQUESTED';
              const isSelected = selectedId === s.id;
              const blocked = s.inProgress + s.ready > 0;
              return (
                <button
                  key={table.id}
                  className={`ca-table-row${isSelected ? ' is-sel' : ''}${isBill ? ' is-bill' : ''}`}
                  onClick={() => selectTable(s.id)}
                >
                  {isBill && <span className="ca-bell" aria-hidden>🔔</span>}
                  <div className="ca-table-info">
                    <span className="ca-table-num">Table {table.number}{table.name ? ` · ${table.name}` : ''}</span>
                    <span className="ca-table-meta">
                      {s.guests ? <><Users size={11} /> {s.guests}名 · </> : null}
                      <Clock size={11} /> {relativeTime(s.openedAt)}
                    </span>
                  </div>
                  <div className="ca-table-right">
                    <span className="ca-table-total">{yen(s.total)}</span>
                    <span className={`ca-table-badge${isBill ? ' is-bill' : ''}${blocked ? ' is-busy' : ''}`}>
                      {isBill ? '会計待ち' : blocked ? '調理中' : `${s.orders}回注文`}
                    </span>
                  </div>
                  <ChevronRight size={14} className="ca-row-arrow" />
                </button>
              );
            })
          )}
        </div>

        {/* ── Right: detail ── */}
        <div className="ca-detail">
          {!selectedId && lastPaid ? (
            <div className="ca-paid-confirm">
              <div className="ca-paid-icon">✓</div>
              <div className="ca-paid-label">会計完了</div>
              <div className="ca-paid-table">Table {lastPaid.tableNumber}</div>
              <div className="ca-paid-total">{yen(lastPaid.total)}</div>
              <div className="ca-paid-method">{lastPaid.method}</div>
              <button className="ca-paid-clear" onClick={() => setLastPaid(null)}>閉じる</button>
            </div>
          ) : !selectedId ? (
            <div className="ca-detail-empty">
              <div className="ca-detail-empty-ico">💴</div>
              <p>左のテーブルを選択してください</p>
            </div>
          ) : loadingDetail && !detail ? (
            <div className="ca-detail-loading"><RefreshCw size={28} className="ca-spin" /></div>
          ) : detail ? (
            <div className="ca-bill-wrap">
              {/* Bill header */}
              <div className="ca-bill-head">
                <div>
                  <h2 className="ca-bill-title">Table {detail.tableNumber}</h2>
                  <p className="ca-bill-sub">
                    {detail.guests ? `${detail.guests}名 · ` : ''}
                    入店 {clockTime(detail.openedAt)} · {detail.bill.orders}回注文
                  </p>
                </div>
                {blocked && (
                  <div className="ca-bill-blocked">
                    <CircleAlert size={14} />
                    調理中 / 提供待ち {detail.bill.inProgress + detail.bill.ready}件
                  </div>
                )}
              </div>

              {/* Itemized bill */}
              <div className="ca-items-scroll">
                <table className="ca-items-table">
                  <tbody>
                    {detail.bill.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="ca-it-name">
                          {line.nameJa || line.nameEn}
                          {line.nameJa && line.nameEn !== line.nameJa && (
                            <small>{line.nameEn}</small>
                          )}
                        </td>
                        <td className="ca-it-unit">{yen(line.unitPrice)}</td>
                        <td className="ca-it-qty">× {line.quantity}</td>
                        <td className="ca-it-total">{yen(line.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Order rounds (collapsed detail) */}
                <details className="ca-rounds">
                  <summary>注文ラウンド詳細を見る ({detail.orders.filter(o => o.status !== 'CANCELLED').length}回)</summary>
                  {detail.orders.filter(o => o.status !== 'CANCELLED').map((order, idx) => (
                    <div key={order.id} className="ca-round">
                      <div className="ca-round-head">
                        第{idx + 1}回 #{String(order.number).padStart(3, '0')}
                        <span className={`ca-round-status is-${order.status.toLowerCase()}`}>
                          {ORDER_STATUS_JA[order.status] ?? order.status}
                        </span>
                        <span className="ca-round-time">{clockTime(order.createdAt)}</span>
                      </div>
                      {order.items.map((item, j) => (
                        <div key={j} className="ca-round-item">
                          <span className="ca-round-item-name">
                            {item.nameJa || item.nameEn}
                            {item.options && item.options.length > 0 && (
                              <span className="ca-round-item-opts">{item.options.map(o => o.nameJa).join(' · ')}</span>
                            )}
                          </span>
                          <span>×{item.quantity}</span>
                          <span>{yen(item.lineTotal)}</span>
                        </div>
                      ))}
                      {order.note && <div className="ca-round-note">📝 {order.note}</div>}
                    </div>
                  ))}
                </details>
              </div>

              {/* Bill summary */}
              <div className="ca-summary">
                <div className="ca-summary-row">
                  <span>小計</span><span>{yen(detail.bill.subtotal)}</span>
                </div>
                <div className="ca-summary-row">
                  <span>消費税</span><span>{yen(detail.bill.tax)}</span>
                </div>
                <div className="ca-summary-row is-grand">
                  <span>合計</span><strong>{yen(detail.bill.total)}</strong>
                </div>
              </div>

              {/* Payment UI */}
              <div className="ca-pay">
                <div className="ca-pm-row">
                  {PAYMENT_METHODS.map(pm => {
                    const Icon = PM_ICONS[pm];
                    return (
                      <button
                        key={pm}
                        className={`ca-pm-btn${paymentMethod === pm ? ' is-active' : ''}`}
                        onClick={() => { setPaymentMethod(pm); setCashReceived(''); setSquareActive(null); stopSquarePoll(); }}
                      >
                        <Icon size={16} /> {PM_LABEL[pm]}
                      </button>
                    );
                  })}
                </div>

                {/* Square integration for CARD and QR methods */}
                {squareCfg?.configured && (paymentMethod === 'CARD' || paymentMethod === 'QR') && !squareActive && (
                  <div className="ca-square-panel">
                    <div className="ca-square-header">
                      <svg className="ca-square-logo" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M19 2H5C3.346 2 2 3.346 2 5v14c0 1.654 1.346 3 3 3h14c1.654 0 3-1.346 3-3V5c0-1.654-1.346-3-3-3zM8 16H8a1 1 0 01-1-1V9a1 1 0 011-1h8a1 1 0 011 1v6a1 1 0 01-1 1H8z"/>
                      </svg>
                      Square で決済
                      <span className="ca-square-env">{squareCfg.environment}</span>
                    </div>

                    {paymentMethod === 'QR' ? (
                      <button className="ca-square-btn" disabled={squarePaying || blocked} onClick={handleSquareQR}>
                        {squarePaying ? <RefreshCw size={15} className="ca-spin" /> : <ScanLine size={15} />}
                        QRコードを生成
                      </button>
                    ) : (
                      <div className="ca-square-terminal">
                        <div className="ca-square-mode-row">
                          <button
                            className={`ca-square-mode-btn${squareMode === 'terminal' ? ' is-active' : ''}`}
                            onClick={() => { setSquareMode('terminal'); loadDevices(); }}
                          >
                            <Monitor size={14} /> カードリーダー
                          </button>
                          <button
                            className={`ca-square-mode-btn${squareMode === 'qr' ? ' is-active' : ''}`}
                            onClick={() => setSquareMode('qr')}
                          >
                            <ScanLine size={14} /> QRコード
                          </button>
                        </div>

                        {squareMode === 'terminal' ? (
                          squareDevices.length === 0 ? (
                            <p className="ca-square-no-dev">
                              ペアリング済みのSquare端末が見つかりません。Square ダッシュボードで端末を登録してください。
                            </p>
                          ) : (
                            <>
                              <select
                                className="ca-square-device-sel"
                                value={selectedDevice}
                                onChange={e => setSelectedDevice(e.target.value)}
                              >
                                {squareDevices.map(d => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}{d.model ? ` (${d.model})` : ''} — {d.status}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="ca-square-btn"
                                disabled={squarePaying || blocked || !selectedDevice}
                                onClick={handleSquareTerminal}
                              >
                                {squarePaying ? <RefreshCw size={15} className="ca-spin" /> : <CreditCard size={15} />}
                                端末に送信
                              </button>
                            </>
                          )
                        ) : (
                          <button className="ca-square-btn" disabled={squarePaying || blocked} onClick={handleSquareQR}>
                            {squarePaying ? <RefreshCw size={15} className="ca-spin" /> : <ScanLine size={15} />}
                            QRコードを生成
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Square QR active: show QR code + polling */}
                {squareActive?.mode === 'qr' && (
                  <div className="ca-sq-active">
                    <div className="ca-sq-active-head">
                      <span>Square QR — お客様にスキャンしていただいてください</span>
                      <button className="ca-sq-close" onClick={() => { stopSquarePoll(); setSquareActive(null); }} title="閉じる">
                        <X size={16} />
                      </button>
                    </div>
                    {squareActive.qrDataUrl ? (
                      <img src={squareActive.qrDataUrl} alt="Square 決済QRコード" className="ca-sq-qr" />
                    ) : (
                      <div className="ca-sq-qr-placeholder">
                        <RefreshCw size={24} className="ca-spin" />
                      </div>
                    )}
                    <div className="ca-sq-url">
                      <a href={squareActive.url} target="_blank" rel="noopener">{squareActive.url}</a>
                    </div>
                    <div className="ca-sq-waiting">
                      <RefreshCw size={14} className="ca-spin" />
                      お支払い待ち… (自動確認中)
                    </div>
                  </div>
                )}

                {/* Square Terminal active: waiting for reader */}
                {squareActive?.mode === 'terminal' && (
                  <div className="ca-sq-active">
                    <div className="ca-sq-active-head">
                      <span>Square 端末 — お客様のカードをタップしてください</span>
                      <button className="ca-sq-close" onClick={handleSquareCancel} title="キャンセル">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="ca-sq-terminal-wait">
                      <CreditCard size={48} />
                      <p>{squareActive.status === 'COMPLETED' ? '決済完了' : squareActive.status === 'IN_PROGRESS' ? 'カードを処理中…' : '端末で決済をお待ちください'}</p>
                      <p className={`ca-sq-status-badge is-${squareActive.status.toLowerCase()}`}>{squareActive.status}</p>
                    </div>
                    <div className="ca-sq-waiting">
                      <RefreshCw size={14} className="ca-spin" />
                      端末の応答を待っています…
                    </div>
                  </div>
                )}

                {paymentMethod === 'CASH' && (
                  <>
                    <div className="ca-change-row">
                      <div className="ca-change-field">
                        <label className="ca-change-label">お預かり金額</label>
                        <div className="ca-amount-wrap">
                          <span className="ca-yen">¥</span>
                          <input
                            type="number"
                            className="ca-amount-input"
                            placeholder={String(billTotal)}
                            value={cashReceived}
                            onChange={e => setCashReceived(e.target.value)}
                            min={0}
                            step={100}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className={`ca-change-disp${change !== null && change < 0 ? ' is-short' : ''}`}>
                        <span className="ca-change-lbl">お釣り</span>
                        <span className="ca-change-amt">
                          {change === null
                            ? '—'
                            : change < 0
                            ? `${yen(Math.abs(change))} 不足`
                            : yen(change)}
                        </span>
                      </div>
                    </div>

                    <div className="ca-quick-row">
                      {quickAmounts(billTotal).map(amt => (
                        <button
                          key={amt}
                          className={`ca-quick-btn${received === amt ? ' is-sel' : ''}`}
                          onClick={() => setCashReceived(String(amt))}
                        >
                          {yen(amt)}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Manual confirm — hidden while Square is processing */}
                {!squareActive && (
                  <button
                    className="ca-confirm-btn"
                    disabled={paying || !canPay}
                    onClick={handlePay}
                  >
                    {paying
                      ? <><RefreshCw size={18} className="ca-spin" /> 処理中…</>
                      : <><CircleCheck size={18} /> 会計完了</>}
                  </button>
                )}

                {blocked && (
                  <p className="ca-pay-warn">
                    <CircleAlert size={14} />
                    調理中または提供待ちの注文があります。キッチンで完了（提供済み）にしてから会計してください。
                  </p>
                )}
                {paymentMethod === 'CASH' && !blocked && received > 0 && received < billTotal && (
                  <p className="ca-pay-warn">
                    <CircleAlert size={14} />
                    お預かり金額が合計より {yen(billTotal - received)} 不足しています。
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => ctx.close();
  } catch {
    // audio unavailable
  }
}
