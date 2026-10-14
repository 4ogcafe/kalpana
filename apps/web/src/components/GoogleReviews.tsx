import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, PenLine, Star } from 'lucide-react';
import { loadReviews, type ReviewsData } from '../lib/reviews';

// The restaurant's Google rating and latest reviews, refreshed on the server about once a month
// (Admin → Page Settings → Google reviews). Falls back to the score typed in the admin.

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="gr-stars" role="img" aria-label={`5つ星のうち${value.toFixed(1)}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="gr-star" style={{ width: size, height: size }}>
            <Star size={size} className="gr-star-bg" aria-hidden="true" />
            <span className="gr-star-fill" style={{ width: `${fill * 100}%` }}>
              <Star size={size} aria-hidden="true" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function ReviewCard({ review }: { review: ReviewsData['reviews'][number] }) {
  const [expanded, setExpanded] = useState(false);
  const long = review.text.length > 140;
  const name = review.authorUrl ? <a href={review.authorUrl} target="_blank" rel="noopener noreferrer">{review.authorName}</a> : review.authorName;
  return (
    <article className="gr-card">
      <header>
        {review.authorPhoto ? (
          <img src={review.authorPhoto} alt="" width={40} height={40} referrerPolicy="no-referrer" loading="lazy" />
        ) : (
          <span className="gr-avatar" aria-hidden="true">{review.authorName.charAt(0)}</span>
        )}
        <div>
          <strong>{name}</strong>
          <span className="gr-meta"><Stars value={review.rating} size={13} /> {review.relativeTime}</span>
        </div>
      </header>
      <p className={expanded || !long ? undefined : 'is-clamped'}>{review.text}</p>
      {long && (
        <button type="button" className="gr-more" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>
          {expanded ? '閉じる' : 'もっと読む'}
        </button>
      )}
    </article>
  );
}

export default function GoogleReviews({ fallbackLink }: { fallbackLink: string }) {
  const [data, setData] = useState<ReviewsData | null | undefined>(undefined);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadReviews().then(setData);
  }, []);

  const link = data?.mapsUrl || fallbackLink;
  const scroll = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: direction * Math.min(track.clientWidth, 360), behavior: 'smooth' });
  };

  return (
    <div className="section gr" style={{ backgroundColor: 'white' }}>
      <div className="centered" style={{ marginBottom: '2rem' }}>
        <div className="section-label">お客様の声</div>
        <h2 className="section-title">Google <em>Reviews</em></h2>
        <div className="divider"></div>
        {data?.rating ? (
          <div className="gr-summary">
            <span className="gr-score">{data.rating.toFixed(1)}</span>
            <span>
              <Stars value={data.rating} size={22} />
              {data.userRatingCount ? <span className="gr-count">{data.userRatingCount.toLocaleString('ja-JP')}件のレビュー</span> : null}
            </span>
          </div>
        ) : (
          <p className="section-sub">お客様の声はGoogleマップでご覧いただけます。</p>
        )}
      </div>

      {data?.reviews && data.reviews.length > 0 && (
        <div className="gr-carousel">
          <button type="button" className="gr-nav is-prev" onClick={() => scroll(-1)} aria-label="前のレビュー"><ChevronLeft size={22} /></button>
          <div className="gr-track" ref={trackRef} tabIndex={0} aria-label="Googleのレビュー">
            {data.reviews.map((review, i) => <ReviewCard key={`${review.authorName}-${i}`} review={review} />)}
          </div>
          <button type="button" className="gr-nav is-next" onClick={() => scroll(1)} aria-label="次のレビュー"><ChevronRight size={22} /></button>
        </div>
      )}

      <div className="centered gr-actions">
        <a href={link} target="_blank" rel="noopener noreferrer" className="btn-warm" style={{ display: 'inline-block', textDecoration: 'none' }}>
          Googleでレビューを読む
        </a>
        {data?.writeReviewUrl && (
          <a href={data.writeReviewUrl} target="_blank" rel="noopener noreferrer" className="gr-write">
            <PenLine size={16} aria-hidden="true" /> レビューを書く
          </a>
        )}
      </div>
      {data?.source === 'manual' && data.reviews.length > 0 && <p className="gr-attrib">Googleマップに寄せられたお客様の声より</p>}
      {data?.source === 'google' && (
        <p className="gr-attrib">
          Googleのレビューを表示しています（{data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }) : ''}更新・毎月自動更新）
        </p>
      )}
    </div>
  );
}
