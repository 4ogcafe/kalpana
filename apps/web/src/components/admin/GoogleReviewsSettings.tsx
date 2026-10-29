import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, MapPin, RefreshCw, Search, Star, Link2, Plus, Trash2 } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

interface FeaturedReviewItem {
  authorName: string;
  rating: number;
  text: string;
  dateLabel?: string;
  relativeTime?: string;
}

interface Status {
  hasKey: boolean;
  placeId: string | null;
  minRating: number;
  manual?: {
    score?: string;
    count?: number | null;
    reviews?: FeaturedReviewItem[];
  };
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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [directPlaceId, setDirectPlaceId] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<'search' | 'refresh' | 'save' | 'manual' | null>(null);

  const [manualScore, setManualScore] = useState('4.5');
  const [manualCount, setManualCount] = useState('185');
  const [reviewsList, setReviewsList] = useState<FeaturedReviewItem[]>([]);

  const applyManualFromData = useCallback((score?: string | number | null, count?: number | null, revs?: FeaturedReviewItem[] | null) => {
    if (score !== undefined && score !== null && String(score) !== '') setManualScore(String(score));
    if (count !== undefined && count !== null) setManualCount(String(count));
    if (Array.isArray(revs)) {
      setReviewsList(
        revs.map(r => ({
          authorName: r.authorName || 'Guest',
          rating: Number(r.rating) || 5,
          text: r.text || '',
          dateLabel: r.dateLabel || r.relativeTime || '1か月前',
        }))
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/reviews/admin');
      if (res.ok) {
        const data: Status = await res.json();
        setStatus(data);
        applyManualFromData(
          data.manual?.score ?? data.rating,
          data.manual?.count ?? data.userRatingCount,
          data.manual?.reviews
        );
        return;
      }
    } catch {
      // Fallback to /api/v1/settings below
    }

    try {
      const sRes = await apiFetch('/api/v1/settings');
      const sData = sRes.ok ? await sRes.json() : {};
      const revs = Array.isArray(sData?.featuredReviews) ? sData.featuredReviews : [];
      const fallbackStatus: Status = {
        hasKey: true,
        placeId: sData?.googlePlaceId || null,
        minRating: Number(sData?.googleReviewsMinRating) || 4,
        manual: {
          score: sData?.storeReviewScore || '4.5',
          count: Number(sData?.storeReviewCount) || 185,
          reviews: revs,
        },
        name: sData?.name || 'Kalpna Indian Cuisine (カルプナ)',
        rating: Number(sData?.storeReviewScore) || 4.5,
        userRatingCount: Number(sData?.storeReviewCount) || 185,
        reviewCount: revs.length,
        fetchedAt: new Date().toISOString(),
        nextRefreshAt: null,
        lastError: null,
        lastErrorAt: null,
      };
      setStatus(fallbackStatus);
      applyManualFromData(sData?.storeReviewScore, sData?.storeReviewCount, revs);
    } catch {
      setStatus({
        hasKey: true,
        placeId: null,
        minRating: 4,
        name: 'Kalpna Indian Cuisine (カルプナ)',
        rating: 4.5,
        userRatingCount: 185,
        reviewCount: 0,
        fetchedAt: null,
        nextRefreshAt: null,
        lastError: null,
        lastErrorAt: null,
      });
    } finally {
      setLoading(false);
    }
  }, [applyManualFromData]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
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
    if (!window.confirm('Googleビジネスプロフィールの連携を解除しますか？')) return;
    await saveSettings({ googlePlaceId: '' }).then(() => toast.success('Disconnected.')).catch(err => toast.error(err.message));
    load();
  };

  const setMinRating = async (minRating: number) => {
    await saveSettings({ googleReviewsMinRating: minRating }).then(() => toast.success('Saved.')).catch(err => toast.error(err.message));
    load();
  };

  const handleSaveManual = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('manual');
    try {
      await saveSettings({
        storeReviewScore: manualScore.trim() || '4.5',
        storeReviewCount: Number.parseInt(manualCount, 10) || 185,
        featuredReviews: reviewsList.map(r => ({
          authorName: r.authorName.trim() || 'Guest',
          rating: Number(r.rating) || 5,
          dateLabel: r.dateLabel?.trim() || '1か月前',
          relativeTime: r.dateLabel?.trim() || '1か月前',
          text: r.text.trim(),
        })),
      });
      toast.success('レビュー設定と口コミ一覧を保存しました。');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました。');
    } finally {
      setBusy(null);
    }
  };

  const updateReviewItem = (index: number, patch: Partial<FeaturedReviewItem>) => {
    setReviewsList(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addReviewItem = () => {
    setReviewsList(prev => [
      { authorName: '新規ゲスト', rating: 5, dateLabel: '1週間前', text: '' },
      ...prev,
    ]);
  };

  const removeReviewItem = (index: number) => {
    setReviewsList(prev => prev.filter((_, i) => i !== index));
  };

  if (loading && !status) {
    return (
      <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6b7280', background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
        Loading Google Reviews settings…
      </div>
    );
  }
  if (!status) return null;
  const connected = Boolean(status.placeId);
  const live = connected && status.hasKey && Boolean(status.fetchedAt);
  const isRefererError = Boolean(status.lastError && (status.lastError.includes('referer') || status.lastError.includes('アプリケーション制限')));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section style={{ ...card, marginTop: 0 }} aria-labelledby="google-reviews-heading">
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
          Googleビジネスプロフィールと連携して、ホームページ上にGoogleレビューと評価を表示・管理します。
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
                    ※ Google Cloud ConsoleでAPIキーの制限を解除すると、最新の口コミと評価が自動同期されます。
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
              <strong>Google Places APIキーが必要です。</strong> サーバーの <code>.env</code> ファイルに <code>GOOGLE_PLACES_API_KEY</code> を設定してください。
              （Google Cloud → Places API (New) キー、アプリケーションの制限 = なし）。
            </div>
          </div>
        ) : (
          <>
            {connected && (
              <div style={{ ...box, background: '#f0fdf4', borderColor: '#bbf7d0', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <CheckCircle2 size={18} color="#15803d" />
                  {status.name ?? `Place ID: ${status.placeId}`}
                  {status.rating !== null && <span style={{ fontWeight: 400 }}>· ★{Number(status.rating).toFixed(1)} ({status.userRatingCount ?? 0} ratings) · {status.reviewCount} reviews</span>}
                </div>
                <dl style={dl}>
                  <dt>Place ID</dt><dd><code style={{ fontSize: '0.8rem', color: '#374151' }}>{status.placeId}</code></dd>
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

            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', background: '#f9fafb', marginBottom: '8px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Search size={15} /> Connect Google Business Listing
              </div>
              <form onSubmit={search} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search restaurant name, e.g. カルプナ 熊谷" aria-label="Find restaurant on Google" style={input} />
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
      </section>

      {/* Featured / Displayed Reviews Editor */}
      <form onSubmit={handleSaveManual} style={{ ...card, marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
              Displayed Rating &amp; Featured Reviews ({reviewsList.length})
            </h3>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
              ホームページに表示される総合評価スコア・クチコミ件数・ピックアップ口コミを直接編集できます。
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" onClick={addReviewItem} style={btn}>
              <Plus size={15} /> Add Review
            </button>
            <button type="submit" disabled={busy !== null} style={darkBtn}>
              {busy === 'manual' ? 'Saving…' : 'Save Reviews'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '18px', padding: '14px', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
            Overall Rating Score (★)
            <input
              type="number"
              step="0.1"
              min="1"
              max="5"
              value={manualScore}
              onChange={e => setManualScore(e.target.value)}
              style={{ ...input, flex: 'none' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
            Total Review Count
            <input
              type="number"
              min="0"
              value={manualCount}
              onChange={e => setManualCount(e.target.value)}
              style={{ ...input, flex: 'none' }}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          {reviewsList.map((rev, idx) => (
            <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', background: '#fff' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
                <input
                  value={rev.authorName}
                  onChange={e => updateReviewItem(idx, { authorName: e.target.value })}
                  placeholder="Reviewer Name (e.g. 田中 健一)"
                  style={{ ...input, flex: '1 1 180px', padding: '0.45rem 0.65rem', fontSize: '0.88rem' }}
                />
                <select
                  value={rev.rating}
                  onChange={e => updateReviewItem(idx, { rating: Number(e.target.value) })}
                  style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem', fontWeight: 600 }}
                >
                  {[5, 4, 3, 2, 1].map(n => (
                    <option key={n} value={n}>{'★'.repeat(n)} ({n}.0)</option>
                  ))}
                </select>
                <input
                  value={rev.dateLabel ?? ''}
                  onChange={e => updateReviewItem(idx, { dateLabel: e.target.value })}
                  placeholder="Date label (e.g. 1か月前)"
                  style={{ ...input, flex: '0 1 140px', padding: '0.45rem 0.65rem', fontSize: '0.88rem' }}
                />
                <button
                  type="button"
                  onClick={() => removeReviewItem(idx)}
                  title="Remove review"
                  style={{ ...btn, padding: '0.45rem 0.65rem', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <textarea
                value={rev.text}
                onChange={e => updateReviewItem(idx, { text: e.target.value })}
                placeholder="Review text…"
                rows={2}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button type="submit" disabled={busy !== null} style={darkBtn}>
            {busy === 'manual' ? 'Saving…' : 'Save Reviews'}
          </button>
        </div>
      </form>
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
