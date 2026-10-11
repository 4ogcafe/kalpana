// Empty in development: Vite proxies /api and /uploads to the API (see vite.config.ts).
// In production set VITE_API_URL if the API is served from another origin.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const LEGACY_UPLOAD_PREFIX = /^https?:\/\/localhost:\d+(?=\/uploads\/)/;
const PUBLIC_CACHE_MS = 60_000;

/** Older records store absolute http://localhost:4000/uploads/... URLs; serve them from the real API origin. */
export function assetUrl(url: string | null | undefined): string {
  if (!url) return '';
  const path = url.replace(LEGACY_UPLOAD_PREFIX, '');
  return path.startsWith('/uploads/') ? `${API_BASE}${path}` : path;
}

/** Authenticated request for the admin area: sends the session cookie and never uses the HTTP cache. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', credentials: 'include', ...init });
  if (res.status === 401 && window.location.pathname.startsWith('/admin')) {
    window.location.assign('/login');
  }
  return res;
}

const publicCache = new Map<string, { expires: number; promise: Promise<unknown> }>();

/** Public GET shared by every component on the page, so e.g. settings is fetched once, not per component. */
export function getPublic<T>(path: string): Promise<T> {
  const cached = publicCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.promise as Promise<T>;

  const promise = fetch(`${API_BASE}${path}`).then((res) => {
    if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
    return res.json() as Promise<T>;
  });
  promise.catch(() => publicCache.delete(path));
  publicCache.set(path, { expires: Date.now() + PUBLIC_CACHE_MS, promise });
  return promise;
}

/** Reads the message from the API's { error: { message } } shape. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message || fallback;
  } catch {
    return fallback;
  }
}
