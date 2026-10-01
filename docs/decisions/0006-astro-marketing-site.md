# 0006 — Astro for the site

Date: 2026-09-04 · Status: accepted

`pupitre.studio` is a static Astro site on Cloudflare Pages, separate from the console. Public docs and blog in MDX, English and French i18n.

Why: a static site has no business in an application Worker, and Astro handles content better than TanStack Start.
