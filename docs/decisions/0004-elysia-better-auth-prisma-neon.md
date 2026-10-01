# 0004 — Elysia, Better Auth, Prisma 7, Neon

Date: 2026-09-04 · Status: accepted, the database replaced by [0011](./0011-cloudflare-d1.md)

The API is an Elysia app in `packages/api`, consumed through Eden Treaty. Authentication is self-hosted Better Auth in `packages/auth`, with the Prisma adapter. Data lives in Neon Postgres through Prisma 7 and the serverless driver.

Why: it is the React-Box stack, verified in production, with its test harness and conventions. Better Auth provides organizations, invitations, device flow, bearer, and later passkeys, MFA and SSO, without an external service. WorkOS and Convex were ruled out.
