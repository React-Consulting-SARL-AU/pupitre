# 0011 — Cloudflare D1 rather than Neon: the whole platform at Cloudflare

Date: 2026-09-12 · Status: accepted · Replaces the database of [0004](./0004-elysia-better-auth-prisma-neon.md)

The platform's data lives in **Cloudflare D1**, one SQLite database per environment, bound to the console's Worker. Prisma 7 stays, on the D1 adapter; the schema moves to `provider = "sqlite"`; migrations are SQL files that wrangler applies. The Worker uses *smart placement*, next to its database, in North America (`enam`), the region of everything Pupitre keeps at Cloudflare.

Why: Neon bills a compute that sleeps after five minutes of silence and wakes on the first request. An enrolled agent reads its state every thirty seconds and beats every five minutes, and the scheduled tasks ran every five minutes: the database never slept, for zero customers. Moving that traffic to a Durable Object would have added a projection to keep up to date and a class of bugs. D1 removes the problem at the root — you pay for rows read and written, and the free tier gives millions a day — and removes a provider, `neonctl`, per-Git-branch branches, two secrets and the guard on the pooled endpoint. The schema already validated on SQLite, the code wrote no interactive transaction: the migration happened before the first customer, when it cost nothing.

What we accept: ten gigabytes per database, a single write region, no interactive transaction — we do not use them — and a case comparison done in code rather than in the query. Backups are D1's *Time Travel*, thirty days.

The day D1 is no longer enough, Prisma and the per-request scope (`@pupitre/db/scope`) are the only two seams to undo: the adapter changes, the API code sees nothing.
