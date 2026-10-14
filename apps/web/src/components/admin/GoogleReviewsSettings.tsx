import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, MapPin, Plus, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

interface ManualReview {
  authorName: string;
  rating: number;
  text: string;
  dateLabel: string;
}

interface Status {
  manual: { score: string; count: number | null; reviews: ManualReview[] };
  hasKey: boolean;
  placeId: string | null;
  minRating: number;
  name: string | null;
  rating: number | null;
  userRatingCount: number | null;
  reviewCount: number;
  fetchedAt: string | null;
  nextRefreshAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}
interface Candidate {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  userRatingCount: number | null;
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** Connects the home page's Google reviews to the restaurant's Google listing; they then refresh monthly. */
export default function GoogleReviewsSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<'search' | 'refresh' | 'save' | null>(null);

  const load = useCallback(() => {
    apiFetch('/api/v1/reviews/admin')
      .then(res => (res.ok ? res.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async (body: object) => {
    const res = await apiFetch('/api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await errorMessage(res, 'Could not save.'));
  };

  const refresh = async (quiet = false) => {
    setBusy('refresh');
    try {
      const res = await apiFetch('/api/v1/reviews/admin/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (!quiet) toast.success(`Updated: ★${data.rating ?? '–'} · ${data.userRatingCount ?? 0} ratings · ${data.reviewCount} reviews.`);
      } else toast.error(await errorMessage(res, 'Could not get reviews from Google.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setBusy(null);
      load();
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy('search');
    try {
      const res = await apiFetch('/api/v1/reviews/admin/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim() }) });
      if (res.ok) setCandidates(await res.json());
      else toast.error(await errorMessage(res, 'Google search failed.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setBusy(null);
    }
  };

  const choose = async (candidate: Candidate) => {
    setBusy('save');
    try {
      await saveSettings({ googlePlaceId: candidate.placeId });
      setCandidates(null);
      toast.success(`Connected to “${candidate.name}”. Getting reviews…`);
      await refresh(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Stop showing Google reviews? The home page goes back to the score typed above.')) return;
    await saveSettings({ googlePlaceId: '' }).then(() => toast.success('Disconnected.')).catch(err => toast.error(err.message));
    load();
  };

  const setMinRating = async (minRating: number) => {
    await saveSettings({ googleReviewsMinRating: minRating }).then(() => toast.success('Saved.')).catch(err => toast.error(err.message));
    load();
  };

  if (!status) return null;
  const connected = Boolean(status.placeId);
  const live = connected && status.hasKey && Boolean(status.fetchedAt);

  return (
    <section style={card} aria-labelledby="google-reviews-heading">
      <h3 id="google-reviews-heading" style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Star size={18} style={{ color: '#f4b400' }} /> Google reviews
      </h3>
      <p style={{ margin: '4px 0 16px', color: '#6b7280', fontSize: '0.875rem' }}>
        Shows your Google rating and latest reviews on the home page. They update automatically every month — or press Refresh now.
      </p>

      {!status.hasKey ? (
        <div style={warn}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Google API key needed.</strong> Ask your developer to add <code>GOOGLE_PLACES_API_KEY</code> to the server settings
            (Google Cloud → enable “Places API (New)” → create an API key restricted to it), then restart the server.
            Until then the home page shows the reviews you add below.
          </div>
        </div>
      ) : (
        <>
          {connected && (
            <div style={{ ...box, background: status.lastError ? '#fef2f2' : '#f0fdf4', borderColor: status.lastError ? '#fecaca' : '#bbf7d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                {status.lastError ? <AlertTriangle size={18} color="#b91c1c" /> : <CheckCircle2 size={18} color="#15803d" />}
                {status.name ?? 'Connected'}
                {status.rating !== null && <span style={{ fontWeight: 400 }}>· ★{status.rating.toFixed(1)} ({status.userRatingCount ?? 0} ratings) · {status.reviewCount} reviews shown by Google</span>}
              </div>
              <dl style={dl}>
                <dt>Last updated</dt><dd>{date(status.fetchedAt)}</dd>
                <dt>Next automatic update</dt><dd>{date(status.nextRefreshAt)}</dd>
                {status.lastError && <><dt>Last problem</dt><dd style={{ color: '#b91c1c' }}>{status.lastError} ({date(status.lastErrorAt)})</dd></>}
              </dl>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                <button type="button" onClick={() => refresh()} disabled={busy !== null} style={darkBtn}><RefreshCw size={15} /> {busy === 'refresh' ? 'Updating…' : 'Refresh now'}</button>
                <button type="button" onClick={disconnect} style={btn}>Disconnect</button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', marginLeft: 'auto' }}>
                  Show reviews with at least
                  <select value={status.minRating} onChange={e => setMinRating(Number(e.target.value))} style={{ padding: '0.35rem', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}★</option>)}
                  </select>
                </label>
              </div>
            </div>
          )}

          <form onSubmit={search} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: connected ? '14px' : 0 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={connected ? 'Search to change the Google listing' : 'Your restaurant name and town, e.g. カルパナ 熊谷'} aria-label="Find your restaurant on Google" style={input} />
            <button type="submit" disabled={busy !== null || query.trim().length < 2} style={connected ? btn : darkBtn}><Search size={15} /> {busy === 'search' ? 'Searching…' : 'Find on Google'}</button>
          </form>
          {candidates && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: '6px' }}>
              {candidates.length === 0 && <li style={{ color: '#6b7280' }}>Nothing found. Try the name with the town or address.</li>}
              {candidates.map(candidate => (
                <li key={candidate.placeId}>
                  <button type="button" onClick={() => choose(candidate)} disabled={busy !== null} style={{ ...btn, width: '100%', justifyContent: 'space-between', textAlign: 'left', fontWeight: 500 }}>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', minWidth: 0 }}>
                      <MapPin size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ minWidth: 0 }}>
                        <strong>{candidate.name}</strong>
                        <span style={{ display: 'block', color: '#6b7280', fontSize: '0.8rem' }}>{candidate.address}</span>
                      </span>
                    </span>
                    <span style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{candidate.rating ? `★${candidate.rating} (${candidate.userRatingCount})` : ''} · Use this</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p style={{ margin: '12px 0 0', color: '#6b7280', fontSize: '0.78rem' }}>
            Google provides your overall rating and up to 5 recent reviews. Reviews are shown with the reviewer's name and a link to Google, as Google requires.
          </p>
        </>
      )}

      <ManualReviews initial={status.manual} live={live} onSaved={load} />
    </section>
  );
}

const EMPTY_REVIEW: ManualReview = { authorName: '', rating: 5, text: '', dateLabel: '' };

/** Reviews copied from the Google listing, shown until the live connection is set up. */
function ManualReviews({ initial, live, onSaved }: { initial: Status['manual']; live: boolean; onSaved: () => void }) {
  const [reviews, setReviews] = useState<ManualReview[]>(initial.reviews.map(review => ({ ...EMPTY_REVIEW, ...review })));
  const [count, setCount] = useState<string>(initial.count === null ? '' : String(initial.count));
  const [saving, setSaving] = useState(false);
  const update = (index: number, patch: Partial<ManualReview>) => setReviews(list => list.map((review, i) => (i === index ? { ...review, ...patch } : review)));

  const save = async () => {
    const cleaned = reviews.map(review => ({ ...review, authorName: review.authorName.trim(), text: review.text.trim(), dateLabel: review.dateLabel.trim() })).filter(review => review.authorName || review.text);
    const incomplete = cleaned.find(review => !review.authorName || !review.text);
    if (incomplete) {
      toast.error('Each review needs the reviewer\'s name and the review text.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featuredReviews: cleaned, storeReviewCount: count.trim() === '' ? null : Math.max(0, Math.round(Number(count)) || 0) }),
      });
      if (res.ok) {
        toast.success(cleaned.length ? `${cleaned.length} review${cleaned.length === 1 ? '' : 's'} saved — they show on the home page now.` : 'Saved.');
        setReviews(cleaned);
        onSaved();
      } else toast.error(await errorMessage(res, 'Could not save the reviews.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e5e7eb' }}>
      <h4 style={{ margin: 0, fontSize: '1rem' }}>{live ? 'Backup reviews' : 'Reviews to show now'}</h4>
      <p style={{ margin: '4px 0 12px', color: '#6b7280', fontSize: '0.85rem' }}>
        {live
          ? 'Live Google reviews are showing. These are only used if the Google connection stops working.'
          : 'Until Google is connected, copy a few real reviews from your Google listing here (name, stars, text). The rating comes from “Review Score” above.'}
      </p>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', marginBottom: '12px' }}>
        Number of Google reviews
        <input type="number" min={0} value={count} onChange={e => setCount(e.target.value)} placeholder="e.g. 214" style={{ ...input, flex: '0 0 110px', padding: '0.45rem 0.6rem' }} />
      </label>
      <div style={{ display: 'grid', gap: '10px' }}>
        {reviews.map((review, index) => (
          <div key={index} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', display: 'grid', gap: '8px', background: '#fafafa' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={review.authorName} onChange={e => update(index, { authorName: e.target.value })} placeholder="Reviewer name" maxLength={60} aria-label="Reviewer name" style={{ ...input, flex: '1 1 160px' }} />
              <select value={review.rating} onChange={e => update(index, { rating: Number(e.target.value) })} aria-label="Stars" style={{ ...input, flex: '0 0 auto', width: 'auto' }}>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
              </select>
              <input value={review.dateLabel} onChange={e => update(index, { dateLabel: e.target.value })} placeholder="When, e.g. 2026年9月" maxLength={30} aria-label="When" style={{ ...input, flex: '0 1 150px' }} />
              <button type="button" onClick={() => setReviews(list => list.filter((_, i) => i !== index))} aria-label="Remove review" style={{ ...btn, color: '#b91c1c', padding: '0.5rem' }}><Trash2 size={16} /></button>
            </div>
            <textarea value={review.text} onChange={e => update(index, { text: e.target.value })} placeholder="Review text, copied from Google" rows={3} maxLength={1000} aria-label="Review text" style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setReviews(list => [...list, { ...EMPTY_REVIEW }])} disabled={reviews.length >= 12} style={btn}><Plus size={15} /> Add review</button>
        <button type="button" onClick={save} disabled={saving} style={darkBtn}>{saving ? 'Saving…' : 'Save reviews'}</button>
      </div>
    </div>
  );
}

const card: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem 2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginTop: '1.5rem' };
const box: CSSProperties = { border: '1px solid', borderRadius: '10px', padding: '12px 14px' };
const warn: CSSProperties = { display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 14px', fontSize: '0.88rem', lineHeight: 1.6 };
const dl: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '8px 0 0', fontSize: '0.85rem' };
const input: CSSProperties = { flex: '1 1 260px', minWidth: 0, padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem' };
const btn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.55rem 0.9rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' };
const darkBtn: CSSProperties = { ...btn, background: '#111827', color: '#fff', border: 'none' };
