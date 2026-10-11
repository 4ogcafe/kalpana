# 2. Frontend rules (React)
- Function components + hooks only. No class components except the error boundary.
- Server state MUST go through TanStack Query; no fetching in `useEffect`.
- Local UI state with `useState`/`useReducer`; avoid global stores unless truly shared (language, auth).
- API calls only via `src/lib/api.ts`; never call `fetch` from components directly.
- Forms: React Hook Form + Zod schema imported from `packages/shared`.
- Every data section MUST implement loading (skeleton), empty and error states.
- Routes are lazy-loaded; admin is a separate chunk never loaded on public pages.
- Feature folders own their components, hooks and tests (`features/menu/...`).
- Props typed with interfaces; components SHOULD stay presentational where possible.
- No inline styles except dynamic values; use Tailwind utilities and theme tokens.

# 3. Styling and design rules
- Colors, fonts, radii and shadows come from Tailwind theme tokens only (no raw hex in components).
- Mobile-first breakpoints (`sm`, `md`, `lg`, `xl`).
- Touch targets ≥ 44 × 44 px.
- Animations ≤ 300 ms and disabled under `prefers-reduced-motion`.
- Prices are formatted with `Intl.NumberFormat` using the configured currency.
- Dietary icons always have a text label or `aria-label`; never rely on color alone (veg/non-veg).

# 4. Accessibility rules
- Semantic landmarks: `header`, `nav`, `main`, `footer`; one `h1` per page; ordered headings.
- All images have meaningful `alt` (decorative: `alt=""`).
- All interactive elements reachable and operable by keyboard with a visible focus ring.
- Carousels: pause/play control, arrow buttons with labels, slide position announced, no auto-advance while focused.
- Form fields have `<label>`; errors linked via `aria-describedby` and announced.
- Map iframe has a `title`; address is also available as text.
- Contrast ≥ 4.5:1 for text, 3:1 for large text and UI components.
