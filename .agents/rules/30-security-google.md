# 6. Security rules
- Secrets only in environment variables; `.env*` (except `.env.example`) is git-ignored.
- Google Places key is server-only. The Maps Embed key is browser-side but restricted by HTTP referrer and API.
- Passwords hashed with bcrypt (cost ≥ 12). JWT in `httpOnly`, `secure`, `sameSite=lax` cookie.
- CSRF protection for cookie-authenticated admin writes (double-submit token or `sameSite=strict` admin cookie).
- Rate limits: login 10/15 min per IP+email; contact 5/hour per IP.
- Uploads: verify MIME by magic bytes, max 5 MB, re-encode images, random file names.
- helmet with a Content Security Policy that allows only required origins (Google Maps, image CDN).
- `pnpm audit` high/critical vulnerabilities block merges.

# 7. Google Maps Platform rules
- Store only `place_id` permanently. Do not persist review text, ratings or photos in the database.
- Cache Places responses in memory only, with a short TTL (≤ 1 h), to protect quota.
- Always display Google attribution and each review's author attribution as returned.
- Do not edit, filter out negative, reorder to mislead, or rewrite review content.
- Re-check the current Google Maps Platform Terms of Service before launch.
