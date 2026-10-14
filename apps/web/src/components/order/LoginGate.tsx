import { Link } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';

const PERKS = ['ご注文ごとにポイントが貯まります', '会員限定の特典が使えます', '注文履歴からワンタップで再注文'];

/** Shown at checkout to visitors who aren't signed in: ordering needs a member account. */
export default function LoginGate() {
  const next = encodeURIComponent('/order');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '1.3rem', color: 'var(--dark-bark)', margin: '0 0 6px' }}>ご注文には会員ログインが必要です</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.92rem' }}>
          カートの商品はそのまま保存されます。ログインまたは会員登録（無料・1分）の後、この画面に戻ってご注文いただけます。
        </p>
      </div>
      <Link to={`/account/login?next=${next}`} className="order-btn order-btn-solid order-btn-lg" style={{ textDecoration: 'none' }}>
        <LogIn size={18} aria-hidden="true" />ログインして注文する
      </Link>
      <Link to={`/account/register?next=${next}`} className="order-btn order-btn-outline order-btn-lg" style={{ textDecoration: 'none' }}>
        <UserPlus size={18} aria-hidden="true" />はじめての方：無料で会員登録
      </Link>
      <ul style={{ margin: 0, paddingLeft: '1.2em', color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.8 }}>
        {PERKS.map(perk => <li key={perk}>{perk}</li>)}
      </ul>
    </div>
  );
}
