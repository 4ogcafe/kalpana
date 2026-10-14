import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { BellRing, Droplets, Receipt, Volume2 } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

// Guest calls from the table QR page. Each kind has its own sound and colour, and keeps ringing
// until a staff member taps Accept — on any admin tab.

type CallType = 'STAFF' | 'WATER' | 'BILL';
interface OpenCall {
  sessionId: string;
  callId: string;
  tableNumber: string;
  type: CallType;
  createdAt: string;
}

const POLL_MS = 4_000;
const RING_EVERY_MS = 5_000;
const CALL = {
  STAFF: { text: 'is calling staff', label: 'Call staff', icon: BellRing },
  WATER: { text: 'would like water', label: 'Water', icon: Droplets },
  BILL: { text: 'would like the bill', label: 'Bill', icon: Receipt },
} satisfies Record<CallType, { text: string; label: string; icon: typeof BellRing }>;

/** One short sound per call type, so staff can tell them apart without looking. */
function playCallSound(audio: AudioContext, type: CallType, at: number) {
  const tone = (frequency: number, start: number, length: number, shape: OscillatorType = 'sine', endFrequency?: number) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = shape;
    osc.frequency.setValueAtTime(frequency, start);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  };
  if (type === 'STAFF') {
    // Urgent: two quick high-low pairs.
    [0, 0.18, 0.5, 0.68].forEach((offset, i) => tone(i % 2 ? 660 : 990, at + offset, 0.15, 'square'));
  } else if (type === 'WATER') {
    // Gentle: two falling "drips".
    tone(1400, at, 0.22, 'sine', 500);
    tone(1200, at + 0.32, 0.22, 'sine', 450);
  } else {
    // Bill: three rising notes, like a register chime.
    [523, 659, 784].forEach((frequency, i) => tone(frequency, at + i * 0.16, 0.3, 'triangle'));
  }
}

const minutesAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

export default function TableCallAlerts({ onOpenTables }: { onOpenTables: () => void }) {
  const [calls, setCalls] = useState<OpenCall[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [, setTick] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/dining/calls');
      if (res.ok) setCalls(await res.json());
    } catch {
      // Retried on the next poll.
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => setTick(t => t + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  // Browsers only allow sound after the person has clicked or typed on the page; any interaction unlocks it.
  const unlock = useCallback(() => {
    try {
      audioRef.current ??= new AudioContext();
      audioRef.current.resume().then(() => setSoundBlocked(audioRef.current?.state !== 'running'));
    } catch {
      setSoundBlocked(true);
    }
  }, []);
  useEffect(() => {
    unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [unlock]);

  // Ring every few seconds while any call is waiting: each kind present plays its own sound, one after another.
  const types = [...new Set(calls.map(call => call.type))].sort().join(',');
  useEffect(() => {
    if (!types) return;
    const ring = () => {
      const audio = audioRef.current;
      if (!audio || audio.state !== 'running') {
        setSoundBlocked(true);
        return;
      }
      setSoundBlocked(false);
      types.split(',').forEach((type, i) => playCallSound(audio, type as CallType, audio.currentTime + 0.05 + i * 1.1));
    };
    ring();
    const intervalId = setInterval(ring, RING_EVERY_MS);
    return () => clearInterval(intervalId);
  }, [types]);

  const accept = async (call: OpenCall) => {
    setBusy(call.callId);
    // Stop ringing for it straight away; the next poll confirms.
    setCalls(prev => prev.filter(c => c.callId !== call.callId));
    try {
      const res = await apiFetch(`/api/v1/dining/sessions/${call.sessionId}/calls/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.callId }),
      });
      if (!res.ok) toast.error(await errorMessage(res, 'Could not accept the call.'));
    } catch {
      toast.error('Network error — the call is still open.');
    } finally {
      setBusy(null);
      load();
    }
  };

  if (calls.length === 0) return null;

  return (
    <div className="tca" role="region" aria-label="Table calls" aria-live="assertive">
      {soundBlocked && (
        <button type="button" className="tca-sound" onClick={unlock}>
          <Volume2 size={16} /> Tap to turn on the call sound
        </button>
      )}
      {calls.map(call => {
        const { text, label, icon: Icon } = CALL[call.type];
        const waited = minutesAgo(call.createdAt);
        return (
          <div key={call.callId} className={`tca-card is-${call.type.toLowerCase()}`}>
            <span className="tca-icon" aria-hidden="true"><Icon size={22} /></span>
            <button type="button" className="tca-text" onClick={onOpenTables} title="Open the table floor">
              <span className="tca-kind">{label}</span>
              <strong>Table {call.tableNumber}</strong> {text}
              <small>{waited === 0 ? 'just now' : `${waited} min ago`}</small>
            </button>
            <button type="button" className="tca-accept" disabled={busy === call.callId} onClick={() => accept(call)}>
              Accept
            </button>
          </div>
        );
      })}
    </div>
  );
}
