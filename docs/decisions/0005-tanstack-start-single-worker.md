# 0005 — TanStack Start sur Cloudflare Workers, un seul déploiement

Date : 2026-09-04 · Statut : acceptée

La console, l'API et l'authentification vivent dans `apps/web`, un TanStack Start déployé sur Cloudflare Workers via le plugin Vite. Le Worker sert `/api/v1` directement ; les routes `api/v1/$` et `api/auth/$` restent le chemin de dev.

Pourquoi : une origine, des cookies simples, un déploiement, les Workflows et R2 à portée. Le propriétaire utilise déjà cette stack.
