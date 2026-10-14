import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { formatDateTime, yen } from '../../lib/format';
import MemberQrModal from './MemberQrModal';
import type { StampCardData } from './types';

const MAX_PER_ROW = 5;
const SEEN_KEY = 'kalpana_stamps_seen';

/** Rows of at most five, as even as possible (10 → 5+5, 8 → 4+4, 7 → 4+3). */
const columnsFor = (perCard: number) => Math.ceil(perCard / Math.ceil(perCard / MAX_PER_ROW));

const readSeen = () => {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
};

/** The member's stamp card, drawn like the paper one: stamps joined by a line, rewards under their stamp. */
export default function StampCard({ card, memberName, preview = false }: {
  card: StampCardData;
  memberName: string;
  /** The admin's settings preview: no QR button, nothing remembered. */
  preview?: boolean;
}) {
  const [showQr, setShowQr] = useState(false);
  // The newest stamp is "pressed" with an animation the first time the member sees it.
  const [seenTotal] = useState(readSeen);
  const animateLatest = !preview && card.totalStamps > seenTotal && card.stamps > 0;
  useEffect(() => {
    if (preview) return;
    try {
      localStorage.setItem(SEEN_KEY, String(card.totalStamps));
    } catch {
      // Storage may be blocked; the animation just plays again next time.
    }
  }, [card.totalStamps, preview]);

  const columns = columnsFor(card.perCard);
  const nextMilestone = card.milestones.find(milestone => milestone.at > card.stamps);
  const stampDates = new Map(card.history.filter(entry => entry.card === card.completedCards + 1).map(entry => [entry.position, entry.createdAt]));

  return (
    <section className="stamp-card" aria-labelledby="stamp-card-title">
      <div className="stamp-card-head">
        <div>
          <div className="stamp-card-kicker">STAMP CARD</div>
          <h2 id="stamp-card-title">スタンプカード</h2>
        </div>
        <div className="stamp-card-count" aria-label={`${card.perCard}個中${card.stamps}個`}>
          <strong>{card.stamps}</strong>/{card.perCard}
        </div>
      </div>

      {card.completedCards > 0 && card.stamps === 0 && (
        <p className="stamp-card-banner">🎉 {card.completedCards}枚目のカードが満了しました！新しいカードがスタートしました。</p>
      )}

      <ol className="stamp-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: card.perCard }, (_, index) => {
          const position = index + 1;
          const stamped = position <= card.stamps;
          const milestone = card.milestones.find(m => m.at === position);
          const rowEnd = position % columns === 0 || position === card.perCard;
          const date = stampDates.get(position);
          return (
            <li key={position} className={`stamp-cell${rowEnd ? ' is-row-end' : ''}`}>
              <span className="stamp-slot-wrap">
                <span
                  role="img"
                  className={`stamp-slot${stamped ? ' is-stamped' : ''}${stamped && animateLatest && position === card.stamps ? ' is-new' : ''}${milestone ? ' is-milestone' : ''}`}
                  aria-label={`${position}個目${stamped ? '：押印済み' : ''}`}
                >
                  {stamped ? <StampMark date={date} /> : <img src="/site-logo-01.webp" alt="" className="stamp-ghost" />}
                  {!stamped && milestone && <span className="stamp-gift" aria-hidden="true">🎁</span>}
                </span>
              </span>
              {position === 1 && !milestone && <span className="stamp-start">スタート!</span>}
              {milestone && <span className="stamp-reward-label">{milestone.titleJa}</span>}
              {milestone && <span className="stamp-reward-tag" aria-hidden="true">特典{card.milestones.indexOf(milestone) + 1}</span>}
            </li>
          );
        })}
      </ol>

      {card.milestones.length > 0 && (
        <ul className="stamp-legend">
          {card.milestones.map((milestone, index) => (
            <li key={milestone.at} className={milestone.at <= card.stamps ? 'is-reached' : undefined}>
              <span className="stamp-reward-tag">特典{index + 1}</span>
              <span>{milestone.at}個目：{milestone.titleJa}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="stamp-card-foot">
        <div className="stamp-card-rules">
          {nextMilestone && (
            <strong>あと{nextMilestone.at - card.stamps}個で「{nextMilestone.titleJa}」</strong>
          )}
          <span>
            {yen(card.rules.minAmount)}以上（税込）のご注文・ご来店ごとに1個
            {card.rules.cooldownHours > 0 && `（${card.rules.cooldownHours}時間に1回まで）`}
          </span>
          {card.nextStampAt && <span>次のスタンプは {formatDateTime(card.nextStampAt)} 以降に押せます</span>}
        </div>
        {!preview && (
          <button type="button" className="stamp-qr-btn" onClick={() => setShowQr(true)}>
            <QrCode size={18} aria-hidden="true" />店頭で提示
          </button>
        )}
      </div>

      {showQr && <MemberQrModal code={card.memberCode} name={memberName} onClose={() => setShowQr(false)} />}
    </section>
  );
}

/** A red "カルパナ" seal, like the rubber stamp at the counter. */
function StampMark({ date }: { date?: string }) {
  const label = date ? new Date(date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }) : '';
  return (
    <svg viewBox="0 0 100 100" className="stamp-mark" aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="#fffdf6" stroke="currentColor" strokeWidth="7" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="50" y={label ? 52 : 58} textAnchor="middle" fontSize="19" fontWeight="900" fill="currentColor" letterSpacing="-1">カルパナ</text>
      {label && <text x="50" y="72" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{label}</text>}
    </svg>
  );
}
