# 0004 — Elysia, Better Auth, Prisma 7, Neon

Date : 2026-09-04 · Statut : acceptée

L'API est une app Elysia dans `packages/api`, consommée par Eden Treaty. L'authentification est Better Auth auto-hébergée dans `packages/auth`, avec l'adaptateur Prisma. Les données sont dans Neon Postgres via Prisma 7 et le driver serverless.

Pourquoi : c'est la stack de React-Box, vérifiée en production, avec son harnais de test et ses conventions. Better Auth donne organisations, invitations, device flow, bearer, et plus tard passkeys, MFA et SSO, sans service externe. WorkOS et Convex ont été écartés.
