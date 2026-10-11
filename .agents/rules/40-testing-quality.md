# 8. Testing rules
| Layer | Tool | Minimum |
|---|---|---|
| Shared schemas & utils | Vitest | 90% lines |
| API services & routes | Vitest + Supertest | 80% lines; every endpoint incl. 400/401/403/404 |
| React components | Vitest + RTL | 70% lines; carousel, filters, form, auth guard required |
| End-to-end | Playwright | Smoke flow in WORKFLOW §1 Phase 5 |

- Tests query by role/label, not by CSS class.
- External services (Google, Cloudinary, email) are mocked in unit/integration tests.
- A bug fix MUST include a test that fails without the fix.

# 9. Performance rules
- Public JS < 200 KB gzip; images served in WebP/AVIF with `srcset` and explicit `width`/`height`.
- Hero image preloaded; below-the-fold images and the map iframe lazy-loaded.
- Fonts self-hosted or preconnected, `font-display: swap`, ≤ 2 families.
- No layout shift from late-loading reviews or map (reserve space).

# 10. Content and data rules
- Every dish needs English name, price, category, dietary flags and spice level; Japanese name SHOULD be filled.
- Allergens use a fixed list: `milk, egg, wheat, nuts, peanuts, soy, sesame, shellfish, fish, mustard`.
- Images minimum 1200 px wide, food-focused, no watermarks, staff-owned or licensed.
- Sold-out items are hidden only if `isActive=false`; otherwise shown with a sold-out state.

# 11. Documentation rules
- README covers setup, scripts, env vars and deploy.
- Behavior changes update `docs/PRD.md`; process changes update `docs/WORKFLOW.md`; new rules are added here via PR.
- OpenAPI spec is generated from Zod schemas and kept in sync.
- Assumptions go in `ASSUMPTIONS.md` with date and owner.
