// "Tell me when my food is ready": browser notifications via web push (public/sw.js shows them).

export type PushTarget = { orderToken: string } | { tableToken: string; sessionId: string } | { member: true };
export type PushState = 'unsupported' | 'needs-install' | 'default' | 'enabled' | 'denied';

const ENABLED_KEY = 'kalpana_push_enabled';
const targetKey = (target: PushTarget) => ('orderToken' in target ? `order:${target.orderToken}` : 'tableToken' in target ? `table:${target.sessionId}` : 'member');

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Whether this browser can get notifications for this order, and whether it already does. */
export function pushState(target: PushTarget): PushState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // iPhone/iPad only allow web notifications for sites added to the home screen.
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (!window.isSecureContext) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && enabledTargets().includes(targetKey(target))) return 'enabled';
  return 'default';
}

function enabledTargets(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ENABLED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

/** Asks permission (must run from a tap), subscribes, and links this browser to the order. */
export async function enableReadyAlerts(target: PushTarget): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await (await fetch('/api/v1/push/key')).json();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = subscription.toJSON();
  const body = { subscription: { endpoint: json.endpoint, keys: json.keys }, ...('member' in target ? {} : target) };
  const res = await fetch('/api/v1/push/subscribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('subscribe failed');
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify([...new Set([...enabledTargets(), targetKey(target)])].slice(-50)));
  } catch {
    // Not remembered; notifications still work.
  }
  return 'enabled';
}

/** A short chime and vibration for when the order page is open at the moment the food is ready. */
export function readyChime() {
  try {
    const audio = new AudioContext();
    [784, 988, 1175].forEach((frequency, i) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + i * 0.18;
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.4);
    });
    setTimeout(() => audio.close(), 1500);
  } catch {
    // No sound available.
  }
  navigator.vibrate?.([200, 100, 200, 100, 300]);
}
