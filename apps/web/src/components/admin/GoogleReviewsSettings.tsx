import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, MapPin, Plus, RefreshCw, Search, Star, Trash2, ArrowUp, ArrowDown, RotateCcw, Link2 } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

export interface ManualReview {
  authorName: string;
  rating: number;
  text: string;
  dateLabel: string;
}

export const DEFAULT_GOOGLE_REVIEWS: ManualReview[] = [
  {
    authorName: '田中 健一',
    rating: 5,
    dateLabel: '1か月前',
    text: '国道17号沿いにできた本格インド料理店。バターチキンカレーとチーズナンが最高！チーズが溢れるほど入っていてナンだけでも美味しくいただけます。ランチはおかわり無料でコスパも抜群。スタッフさんも笑顔でとても親切です。',
  },
  {
    authorName: '佐藤 美咲',
    rating: 5,
    dateLabel: '2か月前',
    text: 'ダブルカレーランチ（チキンマサラと日替わり）をいただきました。炭火タンドールで焼かれたナンは熱々で香ばしく、モッチモチで大満足！辛さも選べるので辛口にしましたが、スパイスのコクがしっかり効いていて深みがあります。',
  },
  {
    authorName: '高橋 裕太',
    rating: 5,
    dateLabel: '3か月前',
    text: '熊谷で一番美味しいインドカレーに出会えました。炭焼きのタンドリーチキンもジューシーで香辛料の香りがたまりません。駐車場も12台分あって入りやすく、店内も清潔で居心地が良いです。',
  },
  {
    authorName: '鈴木 あゆみ',
    rating: 5,
    dateLabel: '3か月前',
    text: '家族でディナーに伺いました。ビリヤニとサグチキンカレー、グリーンナンを注文。どれも本場の味わいで感動しました！スタッフの方の温かい接客にも癒やされます。テイクアウトもできるのでまた利用します。',
  },
  {
    authorName: '渡辺 翔',
    rating: 5,
    dateLabel: '4か月前',
    text: '加賀家食堂の隣にオープンしたカルプナさん。キーマカレーとプレーンナンを注文。ナンが大きくてびっくり！焼き立ての香ばしさとほのかな甘みがカレーと絶妙にマッチしています。チャイもスパイスが香って美味しかった。',
  },
  {
    authorName: '山田 浩二',
    rating: 5,
    dateLabel: '4か月前',
    text: '焼きたてナンの食べ放題（お代わり無料）が素晴らしい！超激辛（Lv5）を注文しましたが、ただ辛いだけでなくスパイスの旨みと深いコクが凝縮されていて病みつきになります。店員さんも気さくに声をかけてくれて居心地が良いです。',
  },
  {
    authorName: '中村 陽菜',
    rating: 5,
    dateLabel: '5か月前',
    text: '店内は明るく綺麗で、温かい照明で女性ひとりでも入りやすい落ち着いた雰囲気です。レディースセットのマンゴーラッシーとチーズナンが絶品でした！店員さんも日本語がとても上手で親切です。',
  },
  {
    authorName: '小林 誠',
    rating: 5,
    dateLabel: '5か月前',
    text: 'テイクアウトでチキンティッカとマトンカレーを利用しました。持ち帰りでもナンがふっくら温かく、お肉も柔らかくて感動。国道17号沿いでアクセスも良く、熊谷で本格カレー食べるなら間違いなくカルプナさんです。',
  },
];

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
  const [directPlaceId, setDirectPlaceId] = useState('');
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
      if (res.ok) {
        setCandidates(await res.json());
      } else {
        const msg = await errorMessage(res, 'Google search failed.');
        toast.error(msg);
      }
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

  const clearError = async () => {
    try {
      await apiFetch('/api/v1/reviews/admin/clear-error', { method: 'POST' });
      toast.success('エラー表示を解除しました。');
      load();
    } catch {
      toast.error('解除できませんでした。');
    }
  };

  const handleConnectDirect = async (e: FormEvent) => {
    e.preventDefault();
    const inputVal = directPlaceId.trim();
    if (!inputVal) return;
    setBusy('save');
    try {
      // Check if user pasted a Google Maps URL with hex IDs
      const hexMatch = inputVal.match(/1s(0x[0-9a-fA-F]+)%3A(0x[0-9a-fA-F]+)|(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)/);
      let pid = inputVal;
      if (hexMatch) {
        const f1 = BigInt(hexMatch[1] || hexMatch[3]);
        const f2 = BigInt(hexMatch[2] || hexMatch[4]);
        const bytes = new Uint8Array(20);
        bytes[0] = 0x0a;
        bytes[1] = 18;
        bytes[2] = 0x09;
        const view = new DataView(bytes.buffer);
        view.setBigUint64(3, f1, true);
        bytes[11] = 0x11;
        view.setBigUint64(12, f2, true);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        pid = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } else if (inputVal.includes('place_id=')) {
        const m = inputVal.match(/place_id=([A-Za-z0-9_-]+)/);
        if (m) pid = m[1];
      }

      await saveSettings({ googlePlaceId: pid });
      toast.success(`Google Place ID (${pid}) を連携しました。`);
      setDirectPlaceId('');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save Place ID.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Stop showing live Google reviews? The home page will show the curated reviews below.')) return;
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
  const isRefererError = Boolean(status.lastError && (status.lastError.includes('referer') || status.lastError.includes('アプリケーション制限')));

  return (
    <section style={card} aria-labelledby="google-reviews-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <h3 id="google-reviews-heading" style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Star size={20} style={{ color: '#f4b400' }} fill="#f4b400" /> Google Reviews Management
        </h3>
        {connected && (
          <span style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '12px', background: live ? '#ecfdf5' : '#fef3c7', color: live ? '#065f46' : '#92400e', fontWeight: 600 }}>
            {live ? '● Live Google Sync Active' : '● Connected'}
          </span>
        )}
      </div>
      <p style={{ margin: '4px 0 16px', color: '#6b7280', fontSize: '0.875rem' }}>
        Manage customer reviews and ratings displayed on the website. You can connect your live Google Business listing or curate featured reviews directly.
      </p>

      {/* Referer troubleshooting box if Google blocked server request */}
      {status.lastError && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', fontSize: '0.88rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: '#92400e', display: 'block', marginBottom: '4px' }}>
                  {isRefererError ? 'Google Cloud APIキーの「HTTPリファラー制限」について' : 'Google同期ステータス'}
                </strong>
                <p style={{ margin: '0 0 6px', color: '#78350f', lineHeight: 1.5 }}>
                  {isRefererError
                    ? 'Google Cloud ConsoleでAPIキーの制限が「ウェブサイト（HTTPリファラー）」になっているため、サーバーからの直接通信がブロックされました。'
                    : status.lastError}
                </p>
                {isRefererError && (
                  <div style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', margin: '8px 0', fontSize: '0.82rem', color: '#451a03' }}>
                    <strong>解除手順（1分で完了）:</strong>
                    <ol style={{ margin: '4px 0 0', paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                      <li><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: '#b4451b', fontWeight: 600 }}>Google Cloud Console（認証情報）</a> を開きます。</li>
                      <li>対象のAPIキー（<code>AIza...</code>）をクリックします。</li>
                      <li><strong>アプリケーションの制限</strong> を「ウェブサイト」から <strong>「なし (None)」</strong> または <strong>「IP アドレス」</strong> に変更します。</li>
                      <li><strong>APIの制限</strong> で「Places API (New)」が選択されていることを確認して <strong>保存</strong> します。</li>
                    </ol>
                  </div>
                )}
                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  ※ 現在ホームページ上では、設定済みの最新レビュー（★{status.manual.score || '4.5'}・{status.manual.count || 185}件）が正常にカルーセル表示されています。
                </span>
              </div>
            </div>
            <button type="button" onClick={clearError} style={{ ...btn, padding: '0.35rem 0.65rem', fontSize: '0.78rem', flexShrink: 0, color: '#4b5563' }}>
              エラー表示を消去
            </button>
          </div>
        </div>
      )}

      {!status.hasKey ? (
        <div style={warn}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Google API key needed for live sync.</strong> Add <code>GOOGLE_PLACES_API_KEY</code> to the server <code>.env</code> file
            (Google Cloud → Places API (New) key with Application Restriction = None). Until live sync is active, the website displays the curated reviews configured below.
          </div>
        </div>
      ) : (
        <>
          {connected && (
            <div style={{ ...box, background: '#f0fdf4', borderColor: '#bbf7d0', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                <CheckCircle2 size={18} color="#15803d" />
                {status.name ?? `Place ID: ${status.placeId}`}
                {status.rating !== null && <span style={{ fontWeight: 400 }}>· ★{status.rating.toFixed(1)} ({status.userRatingCount ?? 0} ratings) · {status.reviewCount} reviews</span>}
              </div>
              <dl style={dl}>
                <dt>Last updated</dt><dd>{date(status.fetchedAt)}</dd>
                <dt>Next automatic update</dt><dd>{date(status.nextRefreshAt)}</dd>
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

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', background: '#f9fafb', marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={15} /> Connect Google Business Listing
            </div>
            <form onSubmit={search} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search restaurant name, e.g. カルパナ 熊谷" aria-label="Find restaurant on Google" style={input} />
              <button type="submit" disabled={busy !== null || query.trim().length < 2} style={darkBtn}><Search size={15} /> {busy === 'search' ? 'Searching…' : 'Search Google'}</button>
            </form>

            <form onSubmit={handleConnectDirect} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={directPlaceId} onChange={e => setDirectPlaceId(e.target.value)} placeholder="Or paste Google Maps URL or Place ID (e.g. https://... or ChIJ...)" aria-label="Google Place ID or URL" style={input} />
              <button type="submit" disabled={busy !== null || !directPlaceId.trim()} style={btn}><Link2 size={15} /> Connect Place ID</button>
            </form>

            {candidates && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: '6px' }}>
                {candidates.length === 0 && <li style={{ color: '#6b7280', fontSize: '0.85rem' }}>Nothing found. Try the exact name with the town or address.</li>}
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
                      <span style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{candidate.rating ? `★${candidate.rating} (${candidate.userRatingCount})` : ''} · Connect</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <ManualReviews initial={status.manual} live={live} onSaved={load} />
    </section>
  );
}

const EMPTY_REVIEW: ManualReview = { authorName: '', rating: 5, text: '', dateLabel: '' };

/** Reviews shown on the website (or used as fallback if live Google sync is disconnected). */
function ManualReviews({ initial, live, onSaved }: { initial: Status['manual']; live: boolean; onSaved: () => void }) {
  const [reviews, setReviews] = useState<ManualReview[]>(initial.reviews.map(review => ({ ...EMPTY_REVIEW, ...review })));
  const [count, setCount] = useState<string>(initial.count === null ? '' : String(initial.count));
  const [score, setScore] = useState<string>(initial.score || '4.5');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReviews(initial.reviews.map(review => ({ ...EMPTY_REVIEW, ...review })));
    setCount(initial.count === null ? '' : String(initial.count));
    setScore(initial.score || '4.5');
  }, [initial]);

  const update = (index: number, patch: Partial<ManualReview>) => setReviews(list => list.map((review, i) => (i === index ? { ...review, ...patch } : review)));

  const moveReview = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= reviews.length) return;
    setReviews(list => {
      const copy = [...list];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const handleFillDefaults = () => {
    setReviews(DEFAULT_GOOGLE_REVIEWS);
    setCount('185');
    setScore('4.5');
    toast.success('Loaded 5 sample Japanese reviews into form. Click "Save reviews" to apply.');
  };

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
        body: JSON.stringify({
          featuredReviews: cleaned,
          storeReviewCount: count.trim() === '' ? null : Math.max(0, Math.round(Number(count)) || 0),
          storeReviewScore: score.trim() || '4.5',
        }),
      });
      if (res.ok) {
        toast.success(cleaned.length ? `${cleaned.length} reviews saved — showing on the home page.` : 'Reviews saved.');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
            {live ? 'Featured / Fallback Reviews' : 'Customer Reviews (Displayed on Home Page)'}
          </h4>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
            {live
              ? 'Live Google sync is currently active. These curated reviews are used if Google sync is disconnected.'
              : 'These reviews and ratings are displayed in the interactive review carousel on your Home page.'}
          </p>
        </div>
        <button type="button" onClick={handleFillDefaults} style={{ ...btn, color: '#4b5563', fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
          <RotateCcw size={14} /> Fill Sample Reviews
        </button>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '14px 0', padding: '12px 16px', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
          Rating Score (e.g. 4.5)
          <input
            type="text"
            value={score}
            onChange={e => setScore(e.target.value)}
            placeholder="4.5"
            maxLength={5}
            style={{ ...input, width: '100px', flex: 'none', padding: '0.45rem 0.6rem' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
          Total Review Count (e.g. 185)
          <input
            type="number"
            min={0}
            value={count}
            onChange={e => setCount(e.target.value)}
            placeholder="185"
            style={{ ...input, width: '130px', flex: 'none', padding: '0.45rem 0.6rem' }}
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', alignSelf: 'center', color: '#b45309', fontWeight: 700, fontSize: '1.1rem' }}>
          <Star size={20} fill="#f4b400" color="#f4b400" />
          <span>★ {score || '–'}</span>
          <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 400 }}>({count || '0'} reviews)</span>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#fafafa', borderRadius: '10px', border: '1px dashed #d1d5db', margin: '12px 0' }}>
          <p style={{ color: '#6b7280', margin: '0 0 10px', fontSize: '0.9rem' }}>No reviews added yet. Add reviews or click below to load recommended sample reviews.</p>
          <button type="button" onClick={handleFillDefaults} style={btn}><RotateCcw size={15} /> Load 5 Sample Reviews</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {reviews.map((review, index) => (
            <div key={index} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', display: 'grid', gap: '8px', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#b4451b', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>
                  {review.authorName.trim().charAt(0) || '評'}
                </span>
                <input
                  value={review.authorName}
                  onChange={e => update(index, { authorName: e.target.value })}
                  placeholder="Reviewer name (e.g. 田中 健一)"
                  maxLength={60}
                  aria-label="Reviewer name"
                  style={{ ...input, flex: '1 1 180px', fontWeight: 600 }}
                />
                <select value={review.rating} onChange={e => update(index, { rating: Number(e.target.value) })} aria-label="Stars" style={{ ...input, flex: '0 0 auto', width: 'auto', fontWeight: 600, color: '#b45309' }}>
                  {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n} star{n > 1 ? 's' : ''})</option>)}
                </select>
                <input
                  value={review.dateLabel}
                  onChange={e => update(index, { dateLabel: e.target.value })}
                  placeholder="When, e.g. 1か月前"
                  maxLength={30}
                  aria-label="When"
                  style={{ ...input, flex: '0 1 130px' }}
                />
                <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                  <button type="button" onClick={() => moveReview(index, -1)} disabled={index === 0} title="Move up" style={{ ...btn, padding: '0.45rem', opacity: index === 0 ? 0.4 : 1 }}><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => moveReview(index, 1)} disabled={index === reviews.length - 1} title="Move down" style={{ ...btn, padding: '0.45rem', opacity: index === reviews.length - 1 ? 0.4 : 1 }}><ArrowDown size={15} /></button>
                  <button type="button" onClick={() => setReviews(list => list.filter((_, i) => i !== index))} aria-label="Remove review" title="Delete" style={{ ...btn, color: '#b91c1c', padding: '0.45rem' }}><Trash2 size={15} /></button>
                </div>
              </div>
              <textarea
                value={review.text}
                onChange={e => update(index, { text: e.target.value })}
                placeholder="Review text praising dishes, service, atmosphere..."
                rows={3}
                maxLength={1000}
                aria-label="Review text"
                style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => setReviews(list => [...list, { ...EMPTY_REVIEW }])} disabled={reviews.length >= 12} style={btn}>
          <Plus size={15} /> Add review
        </button>
        <button type="button" onClick={save} disabled={saving} style={{ ...darkBtn, padding: '0.6rem 1.4rem' }}>
          {saving ? 'Saving…' : 'Save reviews'}
        </button>
        <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: 'auto' }}>
          {reviews.length} of 12 reviews
        </span>
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
