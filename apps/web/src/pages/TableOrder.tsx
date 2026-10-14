import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { BellRing, ChefHat, CircleCheck, Droplets, Flame, Leaf, Minus, Plus, Receipt, ShoppingBag, Sparkles, UtensilsCrossed, X } from 'lucide-react';
import { apiFetch, assetUrl, errorMessage, getPublic } from '../lib/api';
import { useCustomer } from '../lib/customer-context';
import { yen } from '../lib/format';
import ReadyAlertButton from '../components/order/ReadyAlertButton';
import { readyChime } from '../lib/push';
import './table.css';

// The page a table's QR code opens (/t/<code>): the dine-in menu, the table's orders, and the bill.

interface MenuItem {
  id: string;
  nameEn: string;
  nameJa: string | null;
  descriptionJa: string | null;
  price: number;
  imageUrl: string | null;
  spiceLevel: number;
  isVegetarian: boolean;
  isRecommended: boolean;
  allergens: string[];
  isSoldOut: boolean;
}
interface MenuGroup {
  id: string;
  nameEn: string;
  nameJa: string | null;
  items: MenuItem[];
}
interface TableOrder {
  id: string;
  number: number;
  status: 'NEW' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';
  items: { nameEn: string; nameJa: string | null; quantity: number; lineTotal: number }[];
  total: number;
  grandTotal: number;
  createdAt: string;
}
interface Session {
  id: string;
  status: 'OPEN' | 'BILL_REQUESTED';
  openedAt: string;
  guests: number | null;
  openCalls: string[];
  orders: TableOrder[];
  bill: { lines: { nameEn: string; nameJa: string | null; quantity: number; lineTotal: number }[]; subtotal: number; tax: number; total: number; orders: number };
}
interface TableInfo {
  table: { number: string; name: string | null; seats: number | null };
  dining: { enabled: boolean; selfOpen: boolean };
  session: Session | null;
}

const POLL_MS = 8_000;
const DEFAULT_TAX_PERCENT = 8;
const STATUS: Record<TableOrder['status'], { label: string; tone: string }> = {
  NEW: { label: '受付済み', tone: 'new' },
  CONFIRMED: { label: '調理中', tone: 'cooking' },
  READY: { label: 'まもなくお持ちします', tone: 'ready' },
  COMPLETED: { label: 'ご提供済み', tone: 'done' },
  CANCELLED: { label: 'キャンセル', tone: 'cancelled' },
};
const CALLS = [
  { type: 'STAFF', label: 'スタッフを呼ぶ', icon: BellRing },
  { type: 'WATER', label: 'お水をお願い', icon: Droplets },
] as const;

const time = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

/** The cart lives per visit in this browser tab, so a refresh doesn't lose it. */
function useTableCart(sessionId: string | undefined) {
  const key = sessionId ? `kalpana_table_cart_${sessionId}` : null;
  const [cart, setCart] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!key) return;
    try {
      setCart(JSON.parse(sessionStorage.getItem(key) ?? '{}'));
    } catch {
      setCart({});
    }
  }, [key]);
  const update = useCallback(
    (next: Record<string, number>) => {
      setCart(next);
      try {
        if (key) sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not saved in private mode; the cart still works on this page.
      }
    },
    [key],
  );
  return [cart, update] as const;
}

export default function TableOrderPage() {
  const { token = '' } = useParams();
  const { customer } = useCustomer();
  const [info, setInfo] = useState<TableInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [menu, setMenu] = useState<MenuGroup[] | null>(null);
  const [tab, setTab] = useState<'menu' | 'orders'>('menu');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [guests, setGuests] = useState(2);
  const [finished, setFinished] = useState(false);
  const [confirmBill, setConfirmBill] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const callsRef = useRef<string[]>([]);
  const readyRef = useRef<string[] | null>(null);
  const [taxPercent, setTaxPercent] = useState(DEFAULT_TAX_PERCENT);
  const [cart, setCart] = useTableCart(info?.session?.id);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/dining/t/${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const data: TableInfo = await res.json();
      // The visit ended (paid at the register) while this page was open.
      if (sessionRef.current && !data.session) setFinished(true);
      // A call the guests made was accepted by staff: let them know someone is coming.
      const nowOpen = data.session?.openCalls ?? [];
      for (const type of callsRef.current) {
        if (!nowOpen.includes(type) && type !== 'BILL') toast.success(type === 'WATER' ? 'スタッフがお水をお持ちします。' : 'スタッフがまいります。', { id: `accepted-${type}` });
      }
      callsRef.current = nowOpen;
      // A round of food that just became ready: tell the table (the phone may be on the table, face up).
      const readyNow = (data.session?.orders ?? []).filter(order => order.status === 'READY').map(order => order.id);
      if (readyRef.current && readyNow.some(id => !readyRef.current!.includes(id))) {
        readyChime();
        toast.success('お料理ができました！まもなくお席へお持ちします。', { duration: 8000, id: 'food-ready' });
      }
      readyRef.current = readyNow;
      sessionRef.current = data.session?.id ?? null;
      setInfo(data);
    } catch {
      // Offline for a moment: the next poll tries again.
    }
  }, [token]);

  useEffect(() => {
    load();
    fetch('/api/v1/dining/menu', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : []))
      .then((groups: MenuGroup[]) => {
        setMenu(groups);
        setActiveGroup(groups[0]?.id ?? null);
      })
      .catch(() => setMenu([]));
    getPublic<{ taxRatePercent?: number }>('/api/v1/settings')
      .then(settings => typeof settings.taxRatePercent === 'number' && setTaxPercent(settings.taxRatePercent))
      .catch(() => undefined);
    const intervalId = setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const items = useMemo(() => new Map((menu ?? []).flatMap(group => group.items.map(item => [item.id, item] as const))), [menu]);
  const cartLines = Object.entries(cart)
    .map(([id, quantity]) => ({ item: items.get(id), quantity }))
    .filter((line): line is { item: MenuItem; quantity: number } => Boolean(line.item) && line.quantity > 0);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartSubtotal = cartLines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const setQuantity = (id: string, quantity: number) => {
    const next = { ...cart };
    if (quantity > 0) next[id] = Math.min(20, quantity);
    else delete next[id];
    setCart(next);
  };

  const session = info?.session ?? null;

  const startOrdering = async () => {
    const res = await fetch(`/api/v1/dining/t/${encodeURIComponent(token)}/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guests }) });
    if (res.ok) load();
    else toast.error(await errorMessage(res, 'ただいまご利用いただけません。スタッフにお声がけください。'));
  };

  const placeOrder = async () => {
    if (!session || cartLines.length === 0 || sending) return;
    setSending(true);
    try {
      const res = await apiFetch(`/api/v1/dining/t/${encodeURIComponent(token)}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, items: cartLines.map(line => ({ itemId: line.item.id, quantity: line.quantity })), note: note.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setCart({});
        setNote('');
        setCartOpen(false);
        setInfo(prev => (prev ? { ...prev, session: data.session } : prev));
        setTab('orders');
        window.scrollTo({ top: 0 });
        toast.success('ご注文を承りました。お料理ができ次第お持ちします。', { duration: 5000 });
      } else {
        const message = await errorMessage(res, 'ご注文を送信できませんでした。');
        toast.error(message);
        load();
      }
    } catch {
      toast.error('通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setSending(false);
    }
  };

  const call = async (type: string) => {
    if (!session) return;
    const res = await fetch(`/api/v1/dining/t/${encodeURIComponent(token)}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.id, type }) });
    if (res.ok) {
      const data = await res.json();
      setInfo(prev => (prev ? { ...prev, session: data.session } : prev));
      callsRef.current = data.session?.openCalls ?? callsRef.current;
      toast.success(type === 'BILL' ? 'お会計のご準備をいたします。' : type === 'WATER' ? 'お水のご依頼を承りました。少々お待ちください。' : 'スタッフをお呼びしました。少々お待ちください。');
    } else {
      toast.error(await errorMessage(res, '送信できませんでした。'));
      load();
    }
  };

  // ---- Screens before the menu ----
  if (notFound) {
    return (
      <Shell>
        <div className="tb-center">
          <UtensilsCrossed size={40} aria-hidden="true" />
          <h1>このQRコードは無効です</h1>
          <p>お手数ですが、スタッフにお声がけください。</p>
        </div>
      </Shell>
    );
  }
  if (!info || !menu) {
    return <Shell><div className="tb-center" aria-busy="true"><p>読み込み中…</p></div></Shell>;
  }
  if (finished && !session) {
    return (
      <Shell table={info.table.number}>
        <div className="tb-center">
          <CircleCheck size={48} aria-hidden="true" className="tb-ok" />
          <h1>ご来店ありがとうございました</h1>
          <p>またのお越しを心よりお待ちしております。</p>
          {!customer && <Link to="/account/register" className="tb-btn tb-btn-ghost">会員登録でポイントを貯める</Link>}
        </div>
      </Shell>
    );
  }
  if (!info.dining.enabled) {
    return (
      <Shell table={info.table.number}>
        <div className="tb-center">
          <ChefHat size={40} aria-hidden="true" />
          <h1>ただいまQRコードでのご注文は休止中です</h1>
          <p>恐れ入りますが、スタッフにご注文をお申し付けください。</p>
        </div>
      </Shell>
    );
  }
  if (!session) {
    return (
      <Shell table={info.table.number}>
        <div className="tb-center">
          <UtensilsCrossed size={40} aria-hidden="true" />
          <h1>テーブル {info.table.number} へようこそ</h1>
          {info.dining.selfOpen ? (
            <>
              <p>ご人数を選んで、ご注文を始めてください。</p>
              <div className="tb-guests" role="group" aria-label="ご人数">
                <button type="button" onClick={() => setGuests(g => Math.max(1, g - 1))} aria-label="1人減らす"><Minus size={20} /></button>
                <span><strong>{guests}</strong> 名様</span>
                <button type="button" onClick={() => setGuests(g => Math.min(20, g + 1))} aria-label="1人増やす"><Plus size={20} /></button>
              </div>
              <button type="button" className="tb-btn" onClick={startOrdering}>注文を始める</button>
            </>
          ) : (
            <p>ただいまスタッフがテーブルの準備をしております。<br />準備ができるとこの画面から自動でご注文いただけます。</p>
          )}
        </div>
      </Shell>
    );
  }

  // ---- Menu and orders ----
  const activeOrders = session.orders.filter(order => order.status !== 'COMPLETED' && order.status !== 'CANCELLED').length;
  const billRequested = session.status === 'BILL_REQUESTED';

  return (
    <Shell table={info.table.number}>
      <nav className="tb-tabs" aria-label="表示">
        <button type="button" aria-pressed={tab === 'menu'} onClick={() => setTab('menu')}><UtensilsCrossed size={18} /> メニュー</button>
        <button type="button" aria-pressed={tab === 'orders'} onClick={() => setTab('orders')}>
          <Receipt size={18} /> 注文履歴・お会計{activeOrders > 0 && <span className="tb-badge">{activeOrders}</span>}
        </button>
      </nav>

      {billRequested && (
        <div className="tb-banner" role="status">お会計の準備ができました。お帰りの際にレジにてお支払いください。追加のご注文もいただけます。</div>
      )}

      {tab === 'menu' ? (
        <>
          <div className="tb-cats" role="tablist" aria-label="カテゴリー">
            {menu.map(group => (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={activeGroup === group.id}
                onClick={() => {
                  setActiveGroup(group.id);
                  document.getElementById(`cat-${group.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {group.nameJa || group.nameEn}
              </button>
            ))}
          </div>
          {!customer && (
            <p className="tb-member">
              <Sparkles size={14} aria-hidden="true" /> 会員の方は<Link to={`/account/login?next=${encodeURIComponent(`/t/${token}`)}`}>ログイン</Link>するとポイント・スタンプが貯まります
            </p>
          )}
          {customer && <p className="tb-member"><Sparkles size={14} aria-hidden="true" /> {customer.name} 様：このご注文でポイント・スタンプが貯まります</p>}

          {menu.length === 0 ? (
            <p className="tb-center">メニューを準備中です。スタッフにお声がけください。</p>
          ) : (
            menu.map(group => (
              <section key={group.id} id={`cat-${group.id}`} className="tb-group" aria-labelledby={`h-${group.id}`}>
                <h2 id={`h-${group.id}`}>{group.nameJa || group.nameEn}</h2>
                <ul className="tb-items">
                  {group.items.map(item => {
                    const quantity = cart[item.id] ?? 0;
                    return (
                      <li key={item.id} className={`tb-item${item.isSoldOut ? ' is-out' : ''}`}>
                        {item.imageUrl ? <img src={assetUrl(item.imageUrl)} alt="" loading="lazy" /> : <div className="tb-noimg" aria-hidden="true"><UtensilsCrossed size={22} /></div>}
                        <div className="tb-item-body">
                          <div className="tb-item-name">
                            {item.nameJa || item.nameEn}
                            {item.isRecommended && <span className="tb-tag">おすすめ</span>}
                          </div>
                          {item.nameJa && <div className="tb-item-en">{item.nameEn}</div>}
                          {item.descriptionJa && <p className="tb-item-desc">{item.descriptionJa}</p>}
                          <div className="tb-item-meta">
                            {item.spiceLevel > 0 && <span title={`辛さ ${item.spiceLevel}`}>{Array.from({ length: Math.min(item.spiceLevel, 5) }, (_, i) => <Flame key={i} size={12} aria-hidden="true" />)}<span className="sr-only">辛さ{item.spiceLevel}</span></span>}
                            {item.isVegetarian && <span className="tb-veg"><Leaf size={12} aria-hidden="true" /> ベジ</span>}
                          </div>
                          <div className="tb-item-foot">
                            <span className="tb-price">{yen(item.price)}<small>（税込{yen(Math.floor((item.price * (100 + taxPercent)) / 100))}）</small></span>
                            {item.isSoldOut ? (
                              <span className="tb-soldout">売り切れ</span>
                            ) : quantity === 0 ? (
                              <button type="button" className="tb-add" onClick={() => setQuantity(item.id, 1)} aria-label={`${item.nameJa || item.nameEn}を追加`}><Plus size={18} /> 追加</button>
                            ) : (
                              <div className="tb-stepper" role="group" aria-label={`${item.nameJa || item.nameEn}の数量`}>
                                <button type="button" onClick={() => setQuantity(item.id, quantity - 1)} aria-label="1つ減らす"><Minus size={16} /></button>
                                <span aria-live="polite">{quantity}</span>
                                <button type="button" onClick={() => setQuantity(item.id, quantity + 1)} aria-label="1つ増やす"><Plus size={16} /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </>
      ) : (
        <div className="tb-orders">
          {session.orders.length === 0 ? (
            <p className="tb-empty">まだご注文はありません。メニューからお選びください。</p>
          ) : (
            session.orders.map((order, index) => (
              <article key={order.id} className="tb-round">
                <header>
                  <strong>{index + 1}回目のご注文</strong>
                  <span className="tb-muted">{time(order.createdAt)}</span>
                  <span className={`tb-status is-${STATUS[order.status].tone}`}>{STATUS[order.status].label}</span>
                </header>
                <ul>
                  {order.items.map((line, i) => (
                    <li key={i}><span>{line.nameJa || line.nameEn} × {line.quantity}</span><span>{yen(line.lineTotal)}</span></li>
                  ))}
                </ul>
              </article>
            ))
          )}

          {session.orders.some(order => order.status === 'NEW' || order.status === 'CONFIRMED') && (
            <ReadyAlertButton target={{ tableToken: token, sessionId: session.id }} compact />
          )}

          <section className="tb-bill" aria-labelledby="bill-heading">
            <h2 id="bill-heading">ご利用金額</h2>
            <dl>
              <dt>小計（税抜）</dt><dd>{yen(session.bill.subtotal)}</dd>
              <dt>消費税</dt><dd>{yen(session.bill.tax)}</dd>
              <dt className="tb-total">合計（税込）</dt><dd className="tb-total">{yen(session.bill.total)}</dd>
            </dl>
            <p className="tb-muted">お支払いはお帰りの際にレジにてお願いいたします。</p>
          </section>

          <div className="tb-calls">
            {CALLS.map(({ type, label, icon: Icon }) => (
              <button key={type} type="button" className="tb-btn tb-btn-ghost" disabled={session.openCalls.includes(type)} onClick={() => call(type)}>
                <Icon size={18} /> {session.openCalls.includes(type) ? '呼び出し中…' : label}
              </button>
            ))}
            <button type="button" className="tb-btn" disabled={billRequested || session.orders.length === 0} onClick={() => setConfirmBill(true)}>
              <Receipt size={18} /> {billRequested ? 'お会計を依頼済み' : 'お会計をお願いする'}
            </button>
          </div>
        </div>
      )}

      {cartCount > 0 && !cartOpen && (
        <button type="button" className="tb-cartbar" onClick={() => setCartOpen(true)}>
          <span className="tb-cartbar-count"><ShoppingBag size={18} /> {cartCount}点</span>
          <span>注文内容を確認</span>
          <strong>{yen(cartSubtotal)}</strong>
        </button>
      )}

      {cartOpen && (
        <div className="tb-sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="cart-title" onClick={() => setCartOpen(false)}>
          <div className="tb-sheet" onClick={e => e.stopPropagation()}>
            <div className="tb-sheet-head">
              <h2 id="cart-title">ご注文内容</h2>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="閉じる"><X size={22} /></button>
            </div>
            {cartLines.length === 0 ? (
              <p className="tb-empty">カートは空です。</p>
            ) : (
              <ul className="tb-cart">
                {cartLines.map(({ item, quantity }) => (
                  <li key={item.id}>
                    <span className="tb-cart-name">{item.nameJa || item.nameEn}<small>{yen(item.price)}</small></span>
                    <div className="tb-stepper">
                      <button type="button" onClick={() => setQuantity(item.id, quantity - 1)} aria-label="1つ減らす"><Minus size={16} /></button>
                      <span>{quantity}</span>
                      <button type="button" onClick={() => setQuantity(item.id, quantity + 1)} aria-label="1つ増やす"><Plus size={16} /></button>
                    </div>
                    <strong>{yen(item.price * quantity)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <label className="tb-note">
              ご要望（任意）
              <textarea rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="例：辛さ控えめ、取り皿2枚" />
            </label>
            <div className="tb-sheet-total">
              <span>小計（税抜）</span><strong>{yen(cartSubtotal)}</strong>
            </div>
            <button type="button" className="tb-btn tb-btn-lg" disabled={sending || cartLines.length === 0} onClick={placeOrder}>
              {sending ? '送信中…' : `この内容で注文する（${cartCount}点）`}
            </button>
            <p className="tb-muted" style={{ textAlign: 'center' }}>お支払いはお帰りの際にまとめてレジでお願いします。</p>
          </div>
        </div>
      )}

      {confirmBill && (
        <div className="tb-sheet-wrap" role="alertdialog" aria-modal="true" aria-labelledby="bill-title" onClick={() => setConfirmBill(false)}>
          <div className="tb-sheet" onClick={e => e.stopPropagation()}>
            <h2 id="bill-title">お会計をお願いしますか？</h2>
            <p>合計 <strong>{yen(session.bill.total)}</strong>（税込）。スタッフにお知らせします。お支払いはレジにてお願いいたします。</p>
            <button type="button" className="tb-btn tb-btn-lg" onClick={() => { setConfirmBill(false); call('BILL'); }}>お会計をお願いする</button>
            <button type="button" className="tb-btn tb-btn-ghost tb-btn-lg" onClick={() => setConfirmBill(false)}>まだ注文する</button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ table, children }: { table?: string; children: ReactNode }) {
  return (
    <div className="tb">
      <title>{table ? `テーブル ${table} | Kalpana (カルパナ)` : 'テーブルオーダー | Kalpana (カルパナ)'}</title>
      <meta name="robots" content="noindex" />
      <header className="tb-head">
        <img src="/site-logo-01.webp" alt="" width={34} height={34} />
        <span className="tb-brand">カルパナ<small>TABLE ORDER</small></span>
        {table && <span className="tb-table">テーブル <strong>{table}</strong></span>}
      </header>
      <main className="tb-main">{children}</main>
    </div>
  );
}
