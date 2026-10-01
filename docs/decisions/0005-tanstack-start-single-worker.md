# 0005 — TanStack Start on Cloudflare Workers, a single deployment

Date: 2026-09-04 · Status: accepted

The console, the API and authentication live in `apps/web`, a TanStack Start app deployed on Cloudflare Workers through the Vite plugin. The Worker serves `/api/v1` directly; the `api/v1/$` and `api/auth/$` routes remain the dev path.

Why: one origin, simple cookies, one deployment, Workflows and R2 within reach. The owner already uses this stack.
