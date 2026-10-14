import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { useCustomer } from '../../lib/customer-context';
import { offerLabel, yen } from '../../lib/format';
import type { MemberOffer, StampCardData, StampReward } from '../account/types';
import type { Quote, Savings } from './useOrderQuote';

/** Offer and points choices for members. Guests see why signing in is worth it instead. */
export default function MemberSavings({ savings, onChange, quote, next }: {
  savings: Savings;
  onChange: (savings: Savings) => void;
  quote: Quote | null;
  /** Where to come back to after logging in. */
  next: string;
}) {
  const { customer, loyalty } = useCustomer();
  const [offers, setOffers] = useState<MemberOffer[]>([]);
  const [rewards, setRewards] = useState<StampReward[]>([]);

  useEffect(() => {
    if (!customer) return;
    apiFetch('/api/v1/customers/me/offers')
      .then(res => (res.ok ? res.json() : []))
      .then((data: MemberOffer[]) => setOffers(data.filter(offer => !offer.used)))
      .catch(() => setOffers([]));
    apiFetch('/api/v1/customers/me/stamps')
      .then(res => (res.ok ? res.json() : null))
      .then((data: StampCardData | null) => setRewards(data?.rewards ?? []))
      .catch(() => setRewards([]));
  }, [customer]);

  if (customer === undefined) return null;

  if (!customer) {
    return (
      <div style={{ border: '1px dashed var(--gold)', borderRadius: '8px', padding: '14px 16px', backgroundColor: '#fffaf0', fontSize: '0.9rem', lineHeight: 1.6 }}>
        <strong>会員なら、このご注文でポイントが貯まります。</strong>
        <div>会員限定の特典もご利用いただけます。</div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
          <Link to={`/account/login?next=${encodeURIComponent(next)}`} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>ログイン</Link>
          <Link to={`/account/register?next=${encodeURIComponent(next)}`} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>無料で会員登録</Link>
        </div>
      </div>
    );
  }

  const balance = customer.points;
  const pointsEnabled = loyalty?.enabled ?? false;
  const maxPoints = quote ? Math.min(balance, Math.floor((quote.subtotal - quote.offerDiscount - quote.rewardDiscount) / (loyalty?.pointValueYen ?? 1))) : balance;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: '#fffaf0', borderRadius: '8px', padding: '16px' }}>
      <div style={{ fontWeight: 'bold', color: 'var(--dark-bark)' }}>会員特典・ポイント</div>

      {offers.length > 0 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', fontWeight: 'bold' }}>
          特典を使う
          <select value={savings.offerId} onChange={e => onChange({ ...savings, offerId: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5dbcd', fontFamily: 'inherit', fontSize: '1rem' }}>
            <option value="">使わない</option>
            {offers.map(offer => (
              <option key={offer.id} value={offer.id}>
                {offer.titleJa}（{offerLabel(offer)}{offer.minSubtotal > 0 ? `・${yen(offer.minSubtotal)}以上` : ''}）
              </option>
            ))}
          </select>
        </label>
      )}

      {rewards.length > 0 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', fontWeight: 'bold' }}>
          スタンプ特典を使う
          <select value={savings.rewardId} onChange={e => onChange({ ...savings, rewardId: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5dbcd', fontFamily: 'inherit', fontSize: '1rem' }}>
            <option value="">使わない</option>
            {rewards.map(reward => (
              <option key={reward.id} value={reward.id}>
                {reward.titleJa}{reward.kind === 'AMOUNT_OFF' ? `（${yen(reward.amount)}引き）` : '（商品お渡し時に適用）'}
              </option>
            ))}
          </select>
        </label>
      )}

      {pointsEnabled && (
        <div style={{ fontSize: '0.9rem' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>ポイントを使う（保有 {balance.toLocaleString('ja-JP')}pt）</div>
          {balance === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>ご注文の受け取り後にポイントが貯まります。</div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                max={maxPoints}
                inputMode="numeric"
                aria-label="利用するポイント"
                value={savings.pointsToUse || ''}
                placeholder="0"
                onChange={e => onChange({ ...savings, pointsToUse: Math.max(0, Math.min(maxPoints, Math.floor(Number(e.target.value) || 0))) })}
                style={{ width: '120px', padding: '10px', borderRadius: '8px', border: '1px solid #e5dbcd', fontSize: '1rem' }}
              />
              <span>pt</span>
              <button type="button" onClick={() => onChange({ ...savings, pointsToUse: maxPoints })} style={chipStyle}>すべて使う</button>
              {savings.pointsToUse > 0 && <button type="button" onClick={() => onChange({ ...savings, pointsToUse: 0 })} style={chipStyle}>使わない</button>}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

const chipStyle = { padding: '6px 12px', borderRadius: '9999px', border: '1px solid #e5dbcd', background: 'white', cursor: 'pointer', fontSize: '0.85rem' };
