import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { loadSettings } from './settings-store.js';

// The restaurant's Google rating and latest reviews, from the Google Places API (New). Fetched on the
// server (the key never reaches browsers), kept in the database, and refreshed about once a month.
// Google's terms only allow keeping Places content temporarily, so the copy is never older than 30 days.

const PLACES = 'https://places.googleapis.com/v1';
export const REFRESH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const CACHE_ID = 'google-reviews';

export interface GoogleReview {
  authorName: string;
  authorUrl: string | null;
  authorPhoto: string | null;
  rating: number;
  text: string;
  relativeTime: string;
  publishTime: string | null;
  reviewUrl: string | null;
}

export interface ReviewCache {
  placeId: string;
  name: string | null;
  rating: number | null;
  userRatingCount: number | null;
  mapsUrl: string | null;
  reviews: GoogleReview[];
  fetchedAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
}

type Fetch = typeof fetch;

interface PlaceDetails {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: {
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    googleMapsUri?: string;
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  }[];
}

async function placesRequest<T>(path: string, init: RequestInit & { fieldMask: string }, fetchImpl: Fetch): Promise<T> {
  if (!config.googlePlacesApiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set on the server');
  const { fieldMask, headers, ...rest } = init;
  const res = await fetchImpl(`${PLACES}${path}`, {
    ...rest,
    headers: { 'X-Goog-Api-Key': config.googlePlacesApiKey, 'X-Goog-FieldMask': fieldMask, ...(headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) throw new Error(body.error?.message || `Google Places returned ${res.status}`);
  return body;
}

/** Shapes Google's reply into what the website shows. */
export function toCache(placeId: string, details: PlaceDetails, now: Date = new Date()): ReviewCache {
  return {
    placeId,
    name: details.displayName?.text ?? null,
    rating: typeof details.rating === 'number' ? details.rating : null,
    userRatingCount: typeof details.userRatingCount === 'number' ? details.userRatingCount : null,
    mapsUrl: details.googleMapsUri ?? null,
    reviews: (details.reviews ?? [])
      .map((review) => ({
        authorName: review.authorAttribution?.displayName ?? 'Google user',
        authorUrl: review.authorAttribution?.uri ?? null,
        authorPhoto: review.authorAttribution?.photoUri ?? null,
        rating: Number(review.rating) || 0,
        text: (review.text?.text ?? review.originalText?.text ?? '').trim(),
        relativeTime: review.relativePublishTimeDescription ?? '',
        publishTime: review.publishTime ?? null,
        reviewUrl: review.googleMapsUri ?? null,
      }))
      .filter((review) => review.rating > 0),
    fetchedAt: now,
    lastError: null,
    lastErrorAt: null,
  };
}

export async function readCache(): Promise<ReviewCache | null> {
  const row = await prisma.googleReviewCache.findUnique({ where: { id: CACHE_ID } });
  if (!row) return null;
  return {
    placeId: row.placeId,
    name: row.name,
    rating: row.rating,
    userRatingCount: row.userRatingCount,
    mapsUrl: row.mapsUrl,
    reviews: row.reviews as unknown as GoogleReview[],
    fetchedAt: row.fetchedAt,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
  };
}

/** Fetches the latest rating and reviews now. On failure the previous copy is kept and the error recorded. */
export async function refreshReviews(fetchImpl: Fetch = fetch): Promise<ReviewCache> {
  const settings = (await loadSettings()) as { googlePlaceId?: string | null };
  const placeId = settings.googlePlaceId?.trim();
  if (!placeId) throw new Error('Choose your restaurant on Google first (Google Place ID is empty)');
  try {
    const details = await placesRequest<PlaceDetails>(`/places/${encodeURIComponent(placeId)}?languageCode=ja`, {
      method: 'GET',
      fieldMask: 'id,displayName,rating,userRatingCount,googleMapsUri,reviews',
    }, fetchImpl);
    const cache = toCache(placeId, details);
    await prisma.googleReviewCache.upsert({
      where: { id: CACHE_ID },
      create: { id: CACHE_ID, ...cache, reviews: cache.reviews as unknown as Parameters<typeof prisma.googleReviewCache.create>[0]['data']['reviews'] },
      update: { ...cache, reviews: cache.reviews as unknown as Parameters<typeof prisma.googleReviewCache.update>[0]['data']['reviews'] },
    });
    logger.info({ placeId, reviews: cache.reviews.length }, 'Google reviews refreshed');
    return cache;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.googleReviewCache.upsert({
      where: { id: CACHE_ID },
      create: { id: CACHE_ID, placeId, reviews: [], lastError: message, lastErrorAt: new Date() },
      update: { lastError: message, lastErrorAt: new Date(), placeId },
    });
    logger.warn({ err: message }, 'Google reviews refresh failed');
    throw new Error(message);
  }
}

export const isStale = (cache: ReviewCache | null, placeId: string | null | undefined, now: Date = new Date()) =>
  !cache?.fetchedAt || cache.placeId !== placeId || now.getTime() - new Date(cache.fetchedAt).getTime() >= REFRESH_DAYS * DAY_MS;

/** Refreshes when the copy is a month old (or for a different place). Never throws. */
export async function refreshIfStale(fetchImpl: Fetch = fetch): Promise<void> {
  if (!config.googlePlacesApiKey) return;
  const settings = (await loadSettings()) as { googlePlaceId?: string | null };
  if (!settings.googlePlaceId) return;
  const cache = await readCache();
  // After a failure, wait a day before trying again so a bad key doesn't hammer Google.
  if (cache?.lastErrorAt && Date.now() - new Date(cache.lastErrorAt).getTime() < DAY_MS && cache.placeId === settings.googlePlaceId) return;
  if (!isStale(cache, settings.googlePlaceId)) return;
  await refreshReviews(fetchImpl).catch(() => undefined);
}

/** Checks a few times a day whether the monthly refresh is due. */
export function scheduleReviewRefresh(): () => void {
  const run = () => void refreshIfStale().catch(() => undefined);
  const first = setTimeout(run, 15_000);
  const timer = setInterval(run, CHECK_EVERY_MS);
  timer.unref();
  first.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

/** For the admin: find the restaurant on Google by name and address. */
export async function searchPlaces(query: string, fetchImpl: Fetch = fetch) {
  const body = await placesRequest<{ places?: { id: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number }[] }>(
    '/places:searchText',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textQuery: query, languageCode: 'ja', maxResultCount: 5 }),
      fieldMask: 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
    },
    fetchImpl,
  );
  return (body.places ?? []).map((place) => ({
    placeId: place.id,
    name: place.displayName?.text ?? '',
    address: place.formattedAddress ?? '',
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
  }));
}
