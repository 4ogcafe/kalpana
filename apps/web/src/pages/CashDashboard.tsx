import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  AlertCircle, Banknote, CheckCircle, ChefHat, ChevronRight,
  Clock, CreditCard, LogOut, MoreHorizontal, QrCode, RefreshCw, Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import './cash.css';

const POLL_MS = 8_000;
const STATS_POLL_MS = 30_000;
const TZ = 'Asia/Tokyo';

const PAYMENT_METHODS = ['CASH', 'CARD', 'QR', 'OTHER'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PM_LABEL: Record<PaymentMethod, string> = { CASH: '現金', CARD: 'カード', QR: 'QR払い', OTHER: 'その他' };
const PM_ICONS = { CASH: Banknote, CARD: CreditCard, QR: QrCode, OTHER: MoreHorizontal };

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
  const prevTables = useRef<TableRow[]>([]);

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

  // Refresh detail whenever the table list re-polls (order statuses may have changed).
  const tablesKey = tables.map(t => `${t.session?.id}:${t.session?.status}:${t.session?.total}`).join('|');
  useEffect(() => {
    if (selectedId && !paying) loadDetail(selectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey]);

  const selectTable = (sessionId: string) => {
    if (sessionId === selectedId) return;
    setSelectedId(sessionId);
    setDetail(null);
    setPaymentMethod('CASH');
    setCashReceived('');
    loadDetail(sessionId);
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
        throw new Error(err.message ?? '会計処理に失敗しました');
      }
      const { total } = await res.json();
      toast.success(`Table ${detail.tableNumber} — ${yen(total)} 会計完了`);
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
              <CheckCircle size={36} />
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
          {!selectedId ? (
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
                    <AlertCircle size={14} />
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
                        onClick={() => { setPaymentMethod(pm); setCashReceived(''); }}
                      >
                        <Icon size={16} /> {PM_LABEL[pm]}
                      </button>
                    );
                  })}
                </div>

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

                <button
                  className="ca-confirm-btn"
                  disabled={paying || !canPay}
                  onClick={handlePay}
                >
                  {paying
                    ? <><RefreshCw size={18} className="ca-spin" /> 処理中…</>
                    : <><CheckCircle size={18} /> 会計完了</>}
                </button>

                {blocked && (
                  <p className="ca-pay-warn">
                    <AlertCircle size={14} />
                    調理中または提供待ちの注文があります。キッチンで完了（提供済み）にしてから会計してください。
                  </p>
                )}
                {paymentMethod === 'CASH' && !blocked && received > 0 && received < billTotal && (
                  <p className="ca-pay-warn">
                    <AlertCircle size={14} />
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
