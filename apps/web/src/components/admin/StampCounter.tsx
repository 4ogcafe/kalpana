import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { Camera, Gift, Search, Stamp, X } from 'lucide-react';
import jsQR from 'jsqr';
import { apiFetch, errorMessage } from '../../lib/api';
import { formatMemberCode, yen } from '../../lib/format';
import type { StampCardData } from '../account/types';

interface MemberView {
  member: { id: string; name: string; nameKana: string };
  card: StampCardData;
}

interface SearchMatch {
  name: string;
  nameKana: string;
  email: string;
  phone: string;
  memberCode: string;
}

// Same rules as the API (lib/stamps.ts): "kalpana:k7mp-2qxa" → "K7MP2QXA".
const MEMBER_CODE = /^[2-9A-HJKMNP-Z]{8}$/;
const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/^KALPANA:/, '').replace(/[\s-]/g, '');

const SCAN_INTERVAL_MS = 250;
// Frames are scaled down before decoding: fast enough on a tablet, still sharp enough for a phone screen.
const SCAN_WIDTH = 640;

const timeLabel = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Staff scan a member's QR (or type the code) to give an in-store stamp and hand over rewards. */
export default function StampCounter({ focus }: { focus?: number }) {
  const [code, setCode] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // Quick Add → "Give a stamp": bring the counter into view, ready for a scan or a typed code.
  useEffect(() => {
    if (!focus) return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    codeRef.current?.focus({ preventScroll: true });
  }, [focus]);
  const [view, setView] = useState<MemberView | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  /** Opens a member's card by their code. Returns false if no member has that code. */
  const openMember = async (memberCode: string) => {
    const res = await apiFetch(`/api/v1/stamps/member/${encodeURIComponent(memberCode)}`);
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(await errorMessage(res, 'Could not open the member.'));
    setView(await res.json());
    setMatches(null);
    setAmount('');
    setTimeout(() => amountRef.current?.focus(), 0);
    return true;
  };

  /** A scanned or typed member code opens the card; anything else searches by name, kana, phone or email. */
  const lookUp = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    setView(null);
    try {
      const memberCode = normalizeCode(value);
      if (MEMBER_CODE.test(memberCode) && (await openMember(memberCode))) return;

      const res = await apiFetch(`/api/v1/stamps/search?q=${encodeURIComponent(value)}`);
      if (!res.ok) throw new Error(await errorMessage(res, 'Search failed.'));
      const found: SearchMatch[] = await res.json();
      if (found.length === 1) await openMember(found[0].memberCode);
      else {
        setMatches(found);
        if (found.length === 0) toast.error('No member found. Try the member code, phone number, email or name.');
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Network error.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    lookUp(code);
  };

  const giveStamp = async (e: FormEvent) => {
    e.preventDefault();
    if (!view) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/stamps/member/${view.card.memberCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Math.round(Number(amount) || 0) }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const { result } = body;
        setView({ member: body.member, card: body.card });
        setAmount('');
        toast.success(`Stamp ${result.position}/${result.perCard} given to ${body.member.name}.`);
        for (const reward of result.rewards) toast.success(`🎁 Reward earned: ${reward.titleJa}`, { duration: 6000 });
      } else if (body?.error?.code === 'TOO_SOON') {
        toast.error(`Already stamped recently. Next stamp from ${timeLabel(body.error.details.nextAt)}.`);
      } else {
        toast.error(body?.error?.message ?? 'Could not give the stamp.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const redeemReward = async (rewardId: string, title: string) => {
    if (!view || !window.confirm(`Hand over "${title}" to ${view.member.name} now? It can't be used again.`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/stamps/rewards/${rewardId}/use`, { method: 'POST' });
      if (res.ok) {
        toast.success('Reward marked as used.');
        await lookUp(view.card.memberCode);
      } else toast.error(await errorMessage(res, 'Could not use the reward.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const card = view?.card;
  const minAmount = card?.rules.minAmount ?? 0;
  const enough = (Number(amount) || 0) >= minAmount;

  return (
    <section ref={sectionRef} style={panelStyle} aria-labelledby="stamp-counter-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 id="stamp-counter-heading" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Stamp size={18} /> Stamp card at the counter</h3>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>Scan the member's QR (My page → スタンプカード → 店頭で提示), or type their member code, phone number, email or name. Online orders are stamped automatically.</p>
        </div>
      </div>

      <form onSubmit={submitCode} className="stamp-counter-form" style={{ marginTop: '0.75rem' }}>
        <input
          ref={codeRef}
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Code (K7MP-2QXA), phone, email or name"
          aria-label="Member code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          style={inputStyle}
        />
        <button type="submit" disabled={busy || !code.trim()} style={{ ...buttonStyle, backgroundColor: '#000', color: '#fff', border: 'none' }}><Search size={16} /> {busy ? 'Finding…' : 'Find'}</button>
        <button type="button" onClick={() => setScanning(value => !value)} aria-pressed={scanning} style={buttonStyle}><Camera size={16} /> {scanning ? 'Stop camera' : 'Scan QR with camera'}</button>
      </form>

      {scanning && (
        <CameraScanner
          onClose={() => setScanning(false)}
          onCode={value => {
            setScanning(false);
            setCode(formatMemberCode(normalizeCode(value)));
            lookUp(value);
          }}
        />
      )}

      {matches && matches.length > 1 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.4rem' }}>{matches.length} members found — choose one:</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.4rem' }}>
            {matches.map(match => (
              <li key={match.memberCode}>
                <button type="button" disabled={busy} onClick={() => { setBusy(true); openMember(match.memberCode).catch(() => toast.error('Could not open the member.')).finally(() => setBusy(false)); }} style={{ ...buttonStyle, width: '100%', justifyContent: 'space-between', textAlign: 'left', fontWeight: 500 }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <strong>{match.name}</strong>{match.nameKana && ` (${match.nameKana})`}
                    <span style={{ display: 'block', color: '#6b7280', fontSize: '0.8rem' }}>{[match.phone, match.email].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span style={{ color: '#6b7280', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatMemberCode(match.memberCode)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view && card && (
        <div className="stamp-counter-member">
          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{view.member.name}</div>
                <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>{[view.member.nameKana, formatMemberCode(card.memberCode)].filter(Boolean).join(' · ')}</div>
              </div>
              <button type="button" onClick={() => { setView(null); setCode(''); }} aria-label="Clear member" style={{ ...buttonStyle, padding: '0.35rem' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', margin: '0.75rem 0' }} aria-label={`${card.stamps} of ${card.perCard} stamps`}>
              {Array.from({ length: card.perCard }, (_, i) => (
                <span key={i} style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '0.65rem', fontWeight: 700, background: i < card.stamps ? '#b3261e' : '#f3f4f6', color: i < card.stamps ? '#fff' : '#9ca3af', outline: card.milestones.some(m => m.at === i + 1) ? '2px solid #d97706' : 'none' }}>{i + 1}</span>
              ))}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#374151' }}>
              {card.stamps}/{card.perCard} stamps · {card.completedCards} full card{card.completedCards === 1 ? '' : 's'} · {card.totalStamps} total
            </div>
            {!card.enabled ? (
              <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>The stamp card is switched off (Stamps, Offers &amp; Points tab).</p>
            ) : card.nextStampAt ? (
              <p style={{ margin: '0.75rem 0 0', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fef3c7', color: '#92400e', fontSize: '0.85rem' }}>
                Already stamped recently — next stamp from {timeLabel(card.nextStampAt)} ({card.rules.cooldownHours}h rule).
              </p>
            ) : (
              <form onSubmit={giveStamp} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 500, flex: '1 1 140px' }}>
                  Bill amount (¥, incl. tax)
                  <input ref={amountRef} type="number" inputMode="numeric" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(minAmount)} style={inputStyle} />
                </label>
                <button type="submit" disabled={busy || !enough} style={{ ...buttonStyle, backgroundColor: enough ? '#b3261e' : '#e5e7eb', color: enough ? '#fff' : '#6b7280', border: 'none' }}>
                  <Stamp size={16} /> Give stamp
                </button>
                {amount && !enough && <span style={{ fontSize: '0.8rem', color: '#b91c1c', flexBasis: '100%' }}>A stamp needs {yen(minAmount)} or more.</span>}
              </form>
            )}
          </div>

          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Gift size={16} /> Rewards to use</div>
            {card.rewards.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>None right now.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
                {card.rewards.map(reward => (
                  <li key={reward.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '8px', background: '#fffbeb' }}>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{reward.titleJa}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        {reward.kind === 'AMOUNT_OFF' ? `Take ${yen(reward.amount)} off the bill` : 'Give with the order'}
                        {reward.expiresAt && ` · until ${new Date(reward.expiresAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Tokyo' })}`}
                      </span>
                    </span>
                    <button type="button" disabled={busy} onClick={() => redeemReward(reward.id, reward.titleJa)} style={{ ...buttonStyle, whiteSpace: 'nowrap' }}>Use now</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Live camera view that reports the first member QR it sees. Decodes in JavaScript, so it works in
 * every browser (Chrome, Edge, Safari, Firefox; Windows, Mac, iPad, Android).
 */
function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState(() =>
    !window.isSecureContext || !navigator.mediaDevices?.getUserMedia
      ? 'The camera only works on https:// or localhost. Open the admin with https (or on this computer), use a USB QR scanner, or type the code.'
      : '',
  );
  const [ready, setReady] = useState(false);
  // Kept in a ref so a new callback from the parent doesn't restart the camera.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let done = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
      const video = videoRef.current;
      if (!video || !context || video.readyState < 2 || !video.videoWidth) return;
      const scale = Math.min(1, SCAN_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (found && MEMBER_CODE.test(normalizeCode(found.data)) && !done) {
        done = true;
        navigator.vibrate?.(80);
        onCodeRef.current(found.data);
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(media => {
        stream = media;
        const video = videoRef.current;
        if (!video || done) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        video.srcObject = media;
        video.play().catch(() => undefined);
        setReady(true);
        timer = setInterval(scan, SCAN_INTERVAL_MS);
      })
      .catch((err: DOMException) =>
        setProblem(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site (the camera icon in the address bar), then try again.'
            : err?.name === 'NotFoundError'
              ? 'No camera found on this device. Use a USB QR scanner or type the code.'
              : 'The camera could not be started (it may be in use by another app). Type the code instead.',
        ),
      );

    return () => {
      done = true;
      clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return (
    <div style={{ marginTop: '0.75rem', maxWidth: '360px' }}>
      {problem ? (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', margin: 0 }}>{problem}</p>
      ) : (
        <div style={{ position: 'relative' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', minHeight: '180px', borderRadius: '10px', background: '#000', display: 'block' }} aria-label="Camera preview for scanning the member QR" />
          {/* Aiming frame */}
          <span aria-hidden="true" style={{ position: 'absolute', inset: '18%', border: '3px solid rgba(255,255,255,0.85)', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)' }} />
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: '8px', textAlign: 'center', color: '#fff', fontSize: '0.8rem', textShadow: '0 1px 2px #000' }}>
            {ready ? 'Hold the member\'s QR inside the frame' : 'Starting camera…'}
          </span>
        </div>
      )}
      <button type="button" onClick={onClose} style={{ ...buttonStyle, marginTop: '0.5rem' }}><X size={16} /> Stop camera</button>
    </div>
  );
}

const panelStyle: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.25rem' };
const inputStyle: CSSProperties = { padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box', width: '100%' };
const buttonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.6rem 1rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' };
