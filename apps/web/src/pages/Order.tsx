import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { apiFetch, errorMessage, getPublic } from '../lib/api';
import { MAX_QUANTITY, useCart, type CartLine } from '../lib/cart-context';
import { useCustomer } from '../lib/customer-context';
import { toHalfWidth, yen } from '../lib/format';
import LoginGate from '../components/order/LoginGate';
import DeliveryAddressFields from '../components/order/DeliveryAddressFields';
import FulfillmentPicker from '../components/order/FulfillmentPicker';
import { EMPTY_ADDRESS, timeWord, validateAddress, type AddressErrors, type DeliveryAddress, type DeliveryOptions, type Fulfillment } from '../components/order/fulfillment';
import MemberSavings from '../components/order/MemberSavings';
import OrderReview from '../components/order/OrderReview';
import PriceSummary from '../components/order/PriceSummary';
import QuantitySelector from '../components/order/QuantitySelector';
import type { BuyNowState } from '../components/order/OrderButtons';
import { useOrderQuote, type Savings } from '../components/order/useOrderQuote';

interface Slot {
  date: string;
  time: string;
  at: string;
}

interface SlotsResponse {
  enabled: boolean;
  /** Set while the kitchen has paused new online orders because it is too busy. */
  pausedUntil?: string | null;
  note: string;
  pickup: { enabled: boolean; note: string };
  delivery: DeliveryOptions;
  slots: Slot[];
}

// How often an open checkout re-checks which options (pickup / delivery) are switched on.
const RECHECK_MS = 60_000;

const NO_SLOTS: SlotsResponse = {
  enabled: false, note: '', slots: [],
  pickup: { enabled: false, note: '' },
  delivery: { enabled: false, fee: 0, freeOver: 0, minOrder: 0, areas: [], note: '' },
};

type Field = 'name' | 'phone' | 'email' | 'pickupAt';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';
const PHONE_PATTERN = /^[\d\s()+-]{8,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('ja-JP', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' });

const todayKey = (timeZone: string) => new Date().toLocaleDateString('en-CA', { timeZone });

// "Order now" items survive the trip to the login page and back (this tab only).
const BUY_NOW_KEY = 'kalpana_buy_now';

function readStoredBuyNow(): CartLine | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(BUY_NOW_KEY) ?? 'null');
    return stored && typeof stored.id === 'string' && stored.quantity > 0 ? stored : null;
  } catch {
    return null;
  }
}

function storeBuyNow(line: CartLine | null) {
  try {
    if (line) sessionStorage.setItem(BUY_NOW_KEY, JSON.stringify(line));
    else sessionStorage.removeItem(BUY_NOW_KEY);
  } catch {
    // Storage unavailable: the item just won't survive a login redirect.
  }
}

/** Passed to the status page so it can show the "order confirmed" banner once. */
export interface PlacedState {
  justPlaced: true;
}

function validate(form: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.name.trim()) errors.name = 'お名前を入力してください。';
  if (!form.phone.trim()) errors.phone = '電話番号を入力してください。';
  else if (!PHONE_PATTERN.test(form.phone.trim())) errors.phone = '電話番号の形式が正しくありません（例: 090-1234-5678）。';
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) errors.email = 'メールアドレスの形式が正しくありません。';
  if (!form.pickupAt) errors.pickupAt = '日時を選択してください。';
  return errors;
}

export default function Order() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();
  const { customer, refresh: refreshCustomer } = useCustomer();

  // "Order now" from a menu card checks out just that item and leaves the cart as it is.
  const [buyNow, setBuyNow] = useState<CartLine | null>(() => (location.state as BuyNowState | null)?.buyNow ?? readStoredBuyNow());
  useEffect(() => storeBuyNow(buyNow), [buyNow]);
  const lines = buyNow ? [buyNow] : cart.lines;
  const items = lines.map(line => ({ itemId: line.id, quantity: line.quantity }));

  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [form, setForm] = useState({ name: '', phone: '', email: '', pickupAt: '', note: '', website: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  // Orders are sent in two steps: fill in the details, then confirm everything on a review screen.
  const [step, setStep] = useState<'details' | 'review'>('details');
  // Set once the order is saved, so the emptied cart isn't shown while the status page loads.
  const [placed, setPlaced] = useState(false);
  const [asGuest, setAsGuest] = useState(false);
  const [savings, setSavings] = useState<Savings>({ offerId: '', offerIds: [], rewardId: '', pointsToUse: 0 });
  const [fulfillment, setFulfillment] = useState<Fulfillment>('PICKUP');
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({});
  const [saveAddress, setSaveAddress] = useState(false);
  // The latest choice, for the background re-check below.
  const fulfillmentRef = useRef(fulfillment);
  useEffect(() => {
    fulfillmentRef.current = fulfillment;
  }, [fulfillment]);
  const isDelivery = fulfillment === 'DELIVERY';
  const word = timeWord(fulfillment);
  const { quote, problem } = useOrderQuote(items, savings, Boolean(customer), fulfillment);

  // Members don't retype their details; anything already typed is kept.
  useEffect(() => {
    if (!customer) return;
    setForm(prev => ({ ...prev, name: prev.name || customer.name, phone: prev.phone || customer.phone, email: prev.email || customer.email }));
    // Delivery starts from the address saved in the member's profile.
    setAddress(prev => (prev.postalCode || prev.city ? prev : { ...EMPTY_ADDRESS, ...customer.address }));
  }, [customer]);

  /** Refreshes the times for pickup or delivery; resolves to the latest list (times pass while customers fill in the form). */
  const loadSlots = (type: Fulfillment = fulfillment) =>
    apiFetch(`/api/v1/orders/slots?type=${type === 'DELIVERY' ? 'delivery' : 'pickup'}`)
      .then(res => res.json())
      .then((data: SlotsResponse): Slot[] | Promise<Slot[]> => {
        setSlotsData(data);
        // Start on an option the restaurant actually offers.
        if (type === 'PICKUP' && !data.pickup.enabled && data.delivery.enabled) {
          setFulfillment('DELIVERY');
          return loadSlots('DELIVERY');
        }
        // Delivery was switched off while this page was open: fall back to pickup.
        if (type === 'DELIVERY' && !data.delivery.enabled && data.pickup.enabled) {
          toast('現在デリバリーは受け付けておりません。お持ち帰りでご注文いただけます。', { icon: 'ℹ️', id: 'delivery-off' });
          setFulfillment('PICKUP');
          setForm(prev => ({ ...prev, pickupAt: '' }));
          return loadSlots('PICKUP');
        }
        // Pickup only (delivery switched off): no time to choose, the order is for the earliest time.
        if (!data.delivery.enabled) {
          setForm(prev => ({ ...prev, pickupAt: data.slots[0]?.at ?? '' }));
          return data.slots;
        }
        // Keep the chosen time only while it is still offered.
        setForm(prev => (data.slots.some(slot => slot.at === prev.pickupAt) ? prev : { ...prev, pickupAt: '' }));
        return data.slots;
      })
      .catch(() => {
        setSlotsData(NO_SLOTS);
        return [] as Slot[];
      });

  const chooseFulfillment = (type: Fulfillment) => {
    setFulfillment(type);
    setForm(prev => ({ ...prev, pickupAt: '' }));
    setErrors(prev => ({ ...prev, pickupAt: undefined }));
    loadSlots(type);
  };

  useEffect(() => {
    loadSlots();
    getPublic<any>('/api/v1/settings').then(setSettings).catch(console.error);
    // Pickup and delivery can be switched on and off from the admin dashboard at any time, so the
    // options are re-checked while the page is open and whenever the customer comes back to it.
    const recheck = () => {
      if (document.visibilityState === 'visible') loadSlots(fulfillmentRef.current);
    };
    const intervalId = setInterval(recheck, RECHECK_MS);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  // The time is only asked for while delivery is offered; pickup-only orders are for the earliest time.
  const askTime = Boolean(slotsData?.delivery.enabled);
  const earliestSlot = slotsData?.slots[0];

  const slotsByDay = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of slotsData?.slots ?? []) groups.set(slot.date, [...(groups.get(slot.date) ?? []), slot]);
    return [...groups];
  }, [slotsData]);

  const today = todayKey(settings.timezone || DEFAULT_TIMEZONE);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'phone' ? toHalfWidth(value) : value }));
    if (name in errors) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const setLineQuantity = (id: string, quantity: number) => {
    if (buyNow) setBuyNow(quantity > 0 ? { ...buyNow, quantity } : null);
    else cart.setQuantity(id, quantity);
  };

  /** Step 1: check the form, re-check the pickup time against the latest slots, then show the review screen. */
  const handleReview = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    const foundAddress = isDelivery ? validateAddress(address) : {};
    setAddressErrors(foundAddress);
    const firstError = (Object.keys(found) as Field[])[0];
    const firstAddressError = Object.keys(foundAddress)[0];
    if (firstError || firstAddressError) {
      document.getElementById(firstError ? `order-${firstError}` : `addr-${firstAddressError}`)?.focus();
      return;
    }
    if (quote && quote.minOrderShortfall > 0) {
      toast.error(`デリバリーはあと${yen(quote.minOrderShortfall)}のご注文で承ります。`);
      return;
    }
    const latest = await loadSlots();
    if (!askTime) {
      // The earliest time was just refreshed by loadSlots.
      if (latest.length === 0) {
        toast.error(`現在${word}可能な時間がありません。`);
        return;
      }
    } else if (!latest.some(slot => slot.at === form.pickupAt)) {
      setErrors({ pickupAt: `この${word}時間は締め切られました。別の時間をお選びください。` });
      document.getElementById('order-pickupAt')?.focus();
      return;
    }
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => document.getElementById('review-heading')?.focus());
  };

  /** Step 2: send the order the customer just reviewed. */
  const placeOrder = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const rawOfferIds = savings.offerIds && savings.offerIds.length > 0
        ? savings.offerIds
        : savings.offerId
          ? [savings.offerId]
          : [];
      const res = await apiFetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          items,
          offerIds: rawOfferIds,
          offerId: rawOfferIds[0] || null,
          rewardId: savings.rewardId || null,
          pointsToUse: savings.pointsToUse,
          fulfillment,
          ...(isDelivery ? { deliveryAddress: address } : {}),
        }),
      });
      if (res.ok) {
        const { token } = await res.json();
        setPlaced(true);
        const state: PlacedState = { justPlaced: true };
        navigate(`/order/${token}`, { state });
        if (isDelivery && saveAddress) {
          // Best effort: the order is already placed even if saving the address fails.
          apiFetch('/api/v1/customers/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) }).catch(() => undefined);
        }
        // Only what was ordered leaves the cart; an "order now" purchase never touches it.
        if (buyNow) storeBuyNow(null);
        else cart.removeMany(items.map(item => item.itemId));
        refreshCustomer();
        return;
      }
      if (res.status === 401) {
        toast.error('ログインの有効期限が切れました。もう一度ログインしてください。');
        refreshCustomer();
        return;
      }
      if (res.status === 409) {
        // Sold out, slot taken, delivery switched off or points changed: back to the form with fresh data.
        await loadSlots(fulfillmentRef.current);
        setStep('details');
      }
      toast.error(await errorMessage(res, 'ご注文を送信できませんでした。もう一度お試しください。'));
    } catch {
      toast.error('通信エラーが発生しました。入力内容はそのままです。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const phoneLink = settings.phone ? <a href={`tel:${settings.phone}`} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>{settings.phone}</a> : null;
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  return (
    <main>
      <title>ご注文 | Kalpana (カルプナ)</title>
      <meta name="robots" content="noindex" />
      <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '120px', minHeight: '70vh' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 16px' }}>
          <div className="centered" style={{ marginBottom: '40px' }}>
            <div className="section-label">TAKEOUT ORDER</div>
            <h1 className="section-title">テイクアウト<em>ご注文</em></h1>
            <div className="divider"></div>
            <p className="section-sub">ご注文後、店頭でお受け取り・お支払いください</p>
          </div>

          {placed ? (
            <div role="status" style={{ ...cardStyle, textAlign: 'center' }}>ご注文を受け付けました。ご注文状況のページを開いています…</div>
          ) : lines.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center' }}>
              <p style={{ marginTop: 0 }}>カートは空です。</p>
              <Link to="/menu/takeout" className="btn-warm" style={{ display: 'inline-block', textDecoration: 'none' }}>メニューを見る</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '24px', alignItems: 'start' }}>
              <section style={cardStyle} aria-labelledby="cart-heading">
                <h2 id="cart-heading" style={headingStyle}>{buyNow ? 'ご注文の商品' : 'カート'}</h2>
                {buyNow && cart.count > 0 && (
                  <p style={{ margin: '-8px 0 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    この商品だけを注文します。カートの{cart.count}点はそのまま残ります。{' '}
                    <button type="button" onClick={() => setBuyNow(null)} style={linkButton}>カートの商品を注文する</button>
                  </p>
                )}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {lines.map(line => (
                    <li key={line.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eee' }}>
                      <img src={line.img} alt="" width={56} height={56} style={{ borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--dark-bark)' }}>{line.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <QuantitySelector value={line.quantity} max={MAX_QUANTITY} onChange={value => setLineQuantity(line.cartKey, value)} label={line.name} size="sm" />
                          <span style={{ fontWeight: 'bold' }}>{yen(line.price * line.quantity)}</span>
                        </div>
                      </div>
                      <button type="button" aria-label={`${line.name}を削除`} onClick={() => setLineQuantity(line.cartKey, 0)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: '16px' }}>
                  {quote ? (
                    <PriceSummary quote={quote} />
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                      <span>小計 (税抜)</span><span>{yen(subtotal)}</span>
                    </div>
                  )}
                  {problem && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', margin: '8px 0 0' }}>{problem}</p>}
                </div>
                <Link to="/menu/takeout" style={{ display: 'inline-block', marginTop: '16px', color: 'var(--spice)' }}>← メニューに戻る</Link>
              </section>

              <section style={cardStyle} aria-labelledby={(customer || asGuest) && step === 'details' ? 'details-heading' : undefined}>
                {customer === undefined ? (
                  <p aria-busy="true">読み込み中…</p>
                ) : customer === null && !asGuest ? (
                  <LoginGate onGuestCheckout={() => setAsGuest(true)} />
                ) : step === 'review' ? (
                  <OrderReview
                    lines={lines}
                    details={form}
                    fulfillment={fulfillment}
                    deliveryAddress={isDelivery ? address : null}
                    timeIsEstimate={!isDelivery && !askTime}
                    quote={quote}
                    problem={problem}
                    storeAddress={settings.addressJa || settings.addressEn || ''}
                    submitting={submitting}
                    onBack={() => setStep('details')}
                    onConfirm={placeOrder}
                  />
                ) : !slotsData ? (
                  <p aria-busy="true">読み込み中…</p>
                ) : slotsData.pausedUntil ? (
                  <p>
                    ただいま大変混み合っているため、
                    <strong>{new Date(slotsData.pausedUntil).toLocaleTimeString('ja-JP', { timeZone: DEFAULT_TIMEZONE, hour: '2-digit', minute: '2-digit' })}頃</strong>
                    までオンラインでのご注文を一時停止しています。カートの内容は保存されていますので、しばらくしてからもう一度お試しください。
                  </p>
                ) : !slotsData.enabled ? (
                  <p>現在オンラインでのご注文を受け付けておりません。{phoneLink && <>お電話（{phoneLink}）でご注文ください。</>}</p>
                ) : (
                  <form onSubmit={handleReview} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 id="details-heading" style={{ ...headingStyle, marginBottom: 0 }}>お客様情報</h2>
                      {!customer && asGuest && (
                        <span style={{ fontSize: '0.8rem', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>
                          ゲスト注文
                        </span>
                      )}
                    </div>
                    <StepIndicator />
                    {(slotsData.pickup.enabled || slotsData.delivery.enabled) && (
                      <FulfillmentPicker value={fulfillment} onChange={chooseFulfillment} pickupEnabled={slotsData.pickup.enabled} delivery={slotsData.delivery} />
                    )}
                    <FieldBox id="name" label="お名前" required error={errors.name}>
                      <input id="order-name" name="name" maxLength={100} autoComplete="name" value={form.name} onChange={handleChange} {...invalidProps('name', errors.name)} style={inputStyle(errors.name)} />
                    </FieldBox>
                    <FieldBox id="phone" label="電話番号" required error={errors.phone}>
                      <input id="order-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="090-1234-5678" value={form.phone} onChange={handleChange} {...invalidProps('phone', errors.phone)} style={inputStyle(errors.phone)} />
                    </FieldBox>
                    <FieldBox id="email" label="メールアドレス（任意）" error={errors.email}>
                      <input id="order-email" name="email" type="email" maxLength={254} autoComplete="email" value={form.email} onChange={handleChange} {...invalidProps('email', errors.email)} style={inputStyle(errors.email)} />
                    </FieldBox>
                    {isDelivery && (
                      <DeliveryAddressFields value={address} onChange={setAddress} errors={addressErrors} saveToProfile={saveAddress} onSaveToProfileChange={setSaveAddress} areas={slotsData.delivery.areas} />
                    )}
                    {!askTime && slotsByDay.length === 0 && (
                      <span style={{ display: 'block', color: 'var(--spice)' }}>
                        本日・明日は{word}可能な時間がありません。{phoneLink && <>お電話（{phoneLink}）でお問い合わせください。</>}
                      </span>
                    )}
                    {askTime && (
                    <FieldBox id="pickupAt" label={`${word}日時`} required error={errors.pickupAt}>
                      {slotsByDay.length === 0 ? (
                        <span style={{ display: 'block', color: 'var(--spice)', fontWeight: 'normal' }}>
                          本日・明日は{word}可能な時間がありません。{phoneLink && <>お電話（{phoneLink}）でお問い合わせください。</>}
                        </span>
                      ) : (
                        <select id="order-pickupAt" name="pickupAt" value={form.pickupAt} onChange={handleChange} {...invalidProps('pickupAt', errors.pickupAt)} style={inputStyle(errors.pickupAt)}>
                          <option value="">選択してください</option>
                          {slotsByDay.map(([date, slots]) => (
                            <optgroup key={date} label={`${dayLabel(date)}${date === today ? '（本日）' : ''}`}>
                              {slots.map(slot => (
                                <option key={slot.at} value={slot.at}>{dayLabel(date)} {slot.time}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      )}
                    </FieldBox>
                    )}
                    <label style={labelStyle}>
                      ご要望（任意）
                      <textarea name="note" maxLength={500} rows={3} placeholder="辛さのご希望など" value={form.note} onChange={handleChange} style={inputStyle()} />
                    </label>
                    {/* Honeypot: hidden from people, filled in by bots. */}
                    <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={handleChange} style={{ position: 'absolute', left: '-9999px' }} />

                    <MemberSavings savings={savings} onChange={setSavings} quote={quote} next="/order" />

                    <div style={{ backgroundColor: 'var(--cream)', borderRadius: '8px', padding: '12px 16px', fontSize: '0.9rem', lineHeight: 1.6 }}>
                      {!askTime && earliestSlot && (
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>受け取り目安：{dayLabel(earliestSlot.date)} {earliestSlot.time}頃（ご用意ができ次第）</div>
                      )}
                      {isDelivery ? 'お支払いは商品のお届け時に現金でお願いいたします（税込金額）。' : 'お支払いは受け取り時に店頭でお願いいたします（税込金額）。'}
                      {(isDelivery ? slotsData.delivery.note : slotsData.pickup.note) && (
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: '6px' }}>{isDelivery ? slotsData.delivery.note : slotsData.pickup.note}</div>
                      )}
                    </div>
                    {quote && quote.minOrderShortfall > 0 && (
                      <div role="alert" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: '8px', padding: '10px 14px', fontSize: '0.9rem' }}>
                        デリバリーは{yen(slotsData.delivery.minOrder)}以上のご注文で承ります。あと{yen(quote.minOrderShortfall)}分の商品を追加してください。
                      </div>
                    )}

                    <button type="submit" className="order-btn order-btn-solid order-btn-lg" disabled={slotsByDay.length === 0 || !quote || quote.minOrderShortfall > 0}>
                      {quote ? `注文内容を確認する（${yen(quote.grandTotal)} 税込）` : '料金を計算中…'}
                    </button>
                  </form>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StepIndicator() {
  return (
    <ol aria-label="ご注文の流れ" style={{ display: 'flex', gap: '8px', listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
      <li aria-current="step" style={{ color: 'var(--spice)', fontWeight: 700 }}>① 情報入力</li>
      <li aria-hidden="true">›</li>
      <li>② 内容確認</li>
      <li aria-hidden="true">›</li>
      <li>③ 注文完了</li>
    </ol>
  );
}

function FieldBox({ id, label, required = false, error, children }: { id: Field; label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label htmlFor={`order-${id}`} style={{ ...labelStyle, display: 'block' }}>
        {label} {required && <span style={{ color: 'var(--spice)' }}>*</span>}
      </label>
      {children}
      {error && <span id={`order-${id}-error`} role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</span>}
    </div>
  );
}

const invalidProps = (id: Field, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `order-${id}-error` } : {};

const cardStyle: CSSProperties = { backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' };
const headingStyle: CSSProperties = { fontSize: '1.3rem', color: 'var(--dark-bark)', marginTop: 0, marginBottom: '16px' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 'bold', color: 'var(--dark-bark)', fontSize: '0.9rem' };
const linkButton: CSSProperties = { background: 'none', border: 'none', padding: 0, color: 'var(--spice)', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' };
const inputStyle = (error?: string): CSSProperties => ({
  padding: '12px', border: `1px solid ${error ? '#dc2626' : '#e5dbcd'}`, borderRadius: '8px', fontSize: '1rem', fontWeight: 'normal', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
});
