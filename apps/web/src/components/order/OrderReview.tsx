import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, Bike, CheckCircle2, Clock, MapPin, Pencil, ShoppingBag, User, Wallet } from 'lucide-react';
import type { CartLine } from '../../lib/cart-context';
import { formatDateTime, yen } from '../../lib/format';
import { formatAddress, timeWord, type DeliveryAddress, type Fulfillment } from './fulfillment';
import PriceSummary from './PriceSummary';
import type { Quote } from './useOrderQuote';

export interface ReviewDetails {
  name: string;
  phone: string;
  email: string;
  note: string;
  pickupAt: string;
}

/**
 * The last check before the order is sent: every detail in one place, an explicit confirmation tick,
 * and a live total (recalculated by the server, so it matches what will be charged).
 */
export default function OrderReview({ lines, details, fulfillment, deliveryAddress, timeIsEstimate = false, quote, problem, storeAddress, submitting, onBack, onConfirm }: {
  lines: CartLine[];
  details: ReviewDetails;
  fulfillment: Fulfillment;
  deliveryAddress: DeliveryAddress | null;
  /** Pickup only: no time was asked for, so the time shown is the earliest the order can be ready. */
  timeIsEstimate?: boolean;
  quote: Quote | null;
  problem: string;
  storeAddress: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const canConfirm = agreed && Boolean(quote) && !problem && !submitting;
  const isDelivery = fulfillment === 'DELIVERY';
  const word = timeWord(fulfillment);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 id="review-heading" tabIndex={-1} style={{ fontSize: '1.3rem', color: 'var(--dark-bark)', margin: '0 0 4px', outline: 'none' }}>ご注文内容の確認</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>内容をご確認のうえ「注文を確定する」を押してください。まだ注文は確定していません。</p>
      </div>

      <section aria-label={word} style={boxStyle}>
        {isDelivery ? (
          <>
            <Row icon={<Bike size={18} />} label="お届け方法"><strong>デリバリー（ご自宅・ご指定先へお届け）</strong></Row>
            <Row icon={<Clock size={18} />} label="お届け日時"><strong>{formatDateTime(details.pickupAt)}</strong></Row>
            {deliveryAddress && <Row icon={<MapPin size={18} />} label="お届け先">{formatAddress(deliveryAddress)}</Row>}
            <Row icon={<Wallet size={18} />} label="お支払い方法">お届け時に現金でお支払い</Row>
          </>
        ) : (
          <>
            <Row icon={<ShoppingBag size={18} />} label="受け取り方法"><strong>お持ち帰り（店頭受け取り）</strong></Row>
            {timeIsEstimate ? (
              <Row icon={<Clock size={18} />} label="受け取り目安"><strong>{formatDateTime(details.pickupAt)}頃</strong>（ご用意ができ次第）</Row>
            ) : (
              <Row icon={<Clock size={18} />} label="受け取り日時"><strong>{formatDateTime(details.pickupAt)}</strong></Row>
            )}
            {storeAddress && <Row icon={<MapPin size={18} />} label="受け取り場所">{storeAddress}</Row>}
            <Row icon={<Wallet size={18} />} label="お支払い方法">受け取り時に店頭でお支払い</Row>
          </>
        )}
        <Row icon={<User size={18} />} label={isDelivery ? 'ご注文者（お受取人）' : 'ご注文者'}>
          {details.name} ・ {details.phone}
          {details.email && <><br />{details.email}</>}
        </Row>
        {details.note && <Row icon={<Pencil size={18} />} label="ご要望"><span style={{ whiteSpace: 'pre-wrap' }}>{details.note}</span></Row>}
      </section>

      <section aria-label="ご注文の商品" style={boxStyle}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lines.map(line => (
            <li key={line.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 0' }}>
              <span>{line.name} <span style={{ color: 'var(--text-muted)' }}>× {line.quantity}</span></span>
              <span style={{ fontWeight: 600 }}>{yen(line.price * line.quantity)}</span>
            </li>
          ))}
        </ul>
        <div style={{ borderTop: '1px solid #eee', marginTop: '8px', paddingTop: '12px' }}>
          {quote ? <PriceSummary quote={quote} /> : <p aria-busy="true" style={{ margin: 0 }}>料金を計算中…</p>}
          {problem && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', margin: '8px 0 0' }}>{problem}</p>}
        </div>
      </section>

      <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--dark-bark)' }}>
        {isDelivery
          ? 'お届けの際にお電話することがあります。お支払いはお届け時に現金でお願いいたします（税込金額）。'
          : 'お支払いは受け取り時に店頭でお願いいたします（税込金額）。'}
        変更・キャンセルはお電話でご連絡ください。
      </p>

      <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: '20px', height: '20px', marginTop: '1px', accentColor: 'var(--spice)', flexShrink: 0 }} />
        上記の内容（{isDelivery ? 'お届け日時・お届け先' : timeIsEstimate ? '受け取り目安・受け取り場所' : '受け取り日時・受け取り場所'}・商品・金額）を確認しました
      </label>

      {/* Stacked rather than side by side, so the confirm label and total are never cut off on phones. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button type="button" onClick={onConfirm} disabled={!canConfirm} aria-busy={submitting} className="order-btn order-btn-solid order-btn-lg" style={{ whiteSpace: 'normal' }}>
          <CheckCircle2 size={18} aria-hidden="true" />
          {submitting ? '送信中…' : quote ? `注文を確定する（${yen(quote.grandTotal)}）` : '注文を確定する'}
        </button>
        <button type="button" onClick={onBack} disabled={submitting} className="order-btn order-btn-outline order-btn-lg">
          <ArrowLeft size={18} aria-hidden="true" />戻って修正
        </button>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '6px 0' }}>
      <span aria-hidden="true" style={{ color: 'var(--spice)', flexShrink: 0, marginTop: '2px' }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>{children}</div>
      </div>
    </div>
  );
}

const boxStyle: CSSProperties = { border: '1px solid #efe7dc', borderRadius: '14px', padding: '14px 18px', backgroundColor: '#fffdfa' };
