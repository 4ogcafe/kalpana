# 0. Rules for AI coding assistants
1. MUST read `docs/PRD.md`, `docs/WORKFLOW.md` and rules before generating code.
2. MUST work in the phase order from `docs/WORKFLOW.md` and report at the end of each phase.
3. MUST output complete files. No `// ...rest unchanged`, no `TODO: implement`.
4. MUST NOT add, remove or swap libraries outside the approved stack without asking.
5. MUST NOT invent restaurant facts (address, prices, reviews). Use seed placeholders and list them in `ASSUMPTIONS.md`.
6. MUST NOT fabricate Google reviews or ratings, even in demo data. Use a clearly labeled mock only in tests.
7. MUST keep changes scoped to the task; no drive-by refactors.
8. SHOULD explain non-obvious decisions in a short comment or in the phase report.

# 1. General code rules
- TypeScript `strict: true`; no `any` (use `unknown` + narrowing). No `@ts-ignore` without a linked issue.
- Functions do one thing; files SHOULD stay under ~250 lines.
- Naming: `PascalCase` components/types, `camelCase` variables/functions, `UPPER_SNAKE` constants, `kebab-case` file names except React components (`MenuItemCard.tsx`).
- No magic numbers or strings; put them in `constants.ts` or config.
- No `console.log` in committed code; use the logger on the API.
- Dead code and commented-out code are deleted, not kept.
