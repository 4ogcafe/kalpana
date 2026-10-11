# 5. Backend rules (Express + Prisma)
- Layering: `routes → controller → service → prisma`. Controllers contain no business logic; services contain no `req`/`res`.
- Every request body, query and param MUST be validated with Zod before use.
- Database access only via Prisma; no raw SQL unless parameterized and reviewed.
- Money stored as integers (minor units). Dates stored in UTC; convert with the settings timezone at the edge.
- Every admin write MUST check role and write an audit-log entry.
- Errors thrown as typed `AppError(code, status, message)`; the error middleware formats them. Never leak stack traces in production.
- Public GET endpoints set `Cache-Control`; admin writes invalidate the relevant cache keys.
- Schema changes only through Prisma migrations; never edit an applied migration.
