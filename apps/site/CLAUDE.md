# apps/site — Guidelines

`pupitre.studio`, the site. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · product and voice → [`PRODUCT.md`](../../docs/product/PRODUCT.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

## Mandatory stack

Static Astro 5, served by a Cloudflare Worker with static assets (`wrangler.jsonc`, one Worker per environment, `worker/index.ts` only redirects `www` to the apex and answers 404 to a 404 page requested by name) · Tailwind 4 on `@pupitre/design` · MDX for docs, blog, legal · folder-based i18n, English at `/`, French at `/fr` · no client framework outside targeted islands · AVIF and WebP images at four widths with intrinsic dimensions.

**Banned**: component libraries, background animations, illustrations, decorative icons, hard-coded colours, any hard-coded string outside `src/content`.

## Rules

- **The voice of [PRODUCT.md](../../docs/product/PRODUCT.md)**: precise, sober, technical without jargon. Forbidden words, checked by test: "AI-powered", "seamless", "blazing", "bank-grade", "secure by design", "revolutionary".
- **Screenshots show the real app**, through `<ProductShot>` only, never a hand-written `<img>`. No screenshot until the app is in the monochrome design: text instead.
- **Only two SVGs**: a service logo, read from `@pupitre/design/logos` by `<BrandLogo>` in the brand's colours, and an interface icon drawn by `<Icon>` — four inlined Lucide glyphs, `aria-hidden`, never decorative. Never a logo file dropped into the site. A test refuses any other `<svg>`.
- **The number of free servers comes from `FREE_SERVERS` (`@pupitre/shared/plans`)**, through a `{count}` in `src/content` or an imported `{FREE_SERVERS}` in an MDX, never written by hand: a test refuses "3 servers" in the sources. The site shows no price — Pupitre is free up to `FREE_SERVERS` servers per organization, a licence is granted on request beyond that — no trial, no launch, no billing switch.
- **The source code is public** (Apache 2.0 + Commons Clause, licence of React Consulting SARL AU): the site says "source-available" / "source code open to reading", never "open source". The repository address comes from `SOURCE_REPOSITORY_URL` in `src/lib/urls.ts`.
- **Every page exists in fr and en in the same pass.** A script checks route parity.
- **The site does not sell.** The order button opens the console; no account logic here.
- **Legal**: the publisher, the company that signs the app, the contacts, the origins, the document register and the subprocessors come from `@pupitre/shared/legal`; no page writes a company name by hand. The texts are published and binding: a `TODO`, a `draft: true` or a passage in square brackets fails the production build and `check:content`. What the terms say about the agent — what it sends, what the platform can make it do — is updated before the code that changes it. See [`docs/legal.md`](../../docs/legal.md).

## Architecture

```
src/pages/       index · pricing · download · integrations · security · docs/** · blog/** · legal/** · og/[...slug].png · llms.txt · .well-known/security.txt · 404 · fr/**
src/content/     docs/{en,fr} · blog/ · legal/ (MDX) · changelog/ (MDX, release notes read by the release pipeline, never rendered) · site/ (home, free page `/pricing`, download, integrations, security, catalogue, module docs) · ui/ (interface strings)
src/layouts/     Base · Docs · Post
src/components/  Nav · Footer · Hero · Steps · Section · PageHeader · Card-like (Feature, Claim) · Pricing (free servers, licence beyond that, source code) · FreeNote · Download · Integrations · Security · Docs* · Callout · ProductShot · StatusMark · Analytics
src/lib/         releases.ts · docs.ts · docs-entries.ts · og.ts · og-pages.ts · feeds.ts · platform.ts · analytics.ts · affiliate.ts (`?ref=` cookie for the console, tracking only, no offer) · i18n.ts · theme.ts · seo.ts · structured-data.ts · security-txt.ts (contact from `LEGAL_CONTACTS.security`, expiry renewed at every build) · urls.ts (console, status, source code repository)
src/assets/fonts Bricolage and JetBrains Mono, read at build time for the Open Graph images only; the pages serve the woff2 files of `@pupitre/design/fonts.css`, never Google Fonts
scripts/         check-content.ts (parity, forbidden words, blog translations) · legal.ts (legal pages guard, Astro integration) · redirects.ts (every top-level page has its redirect) · not-found.ts (`fr/404/index.html` → `fr/404.html`, where the assets layer looks for it)
worker/          index.ts — `www` → apex, a 404 page requested by name answers 404, then the assets; nothing else
public/          robots.txt · _headers · _redirects · favicons and manifest, copied from the `bun --cwd=packages/design run brand` kit
```

The design lives in `src/styles/global.css`: Tailwind 4 `@utility` classes set on the `@pupitre/design` tokens (`shell`, `card`, `card-link`, `eyebrow`, `tag`, `mark-dot`, `prose`, `display-1`…). A component never writes a colour, radius or shadow value.

The catalogue's module pages are **generated** from `src/content/site/catalog.ts` and `src/content/site/module-docs.ts`: one `docs/services/[module]` route per language, never one MDX file per module. `catalog.ts` follows the categories and order of `MODULE_CATEGORIES` in `@pupitre/shared/catalog`, those of the desktop app: the `/integrations` page, the docs index and its sidebar group the services by these categories.

The site has no changelog page: `src/content/changelog/` remains the source of the release pipeline's release notes (see [`docs/monorepo.md`](../../docs/monorepo.md#the-changelog)), with no Astro collection and no route.

Two build variables, absent locally: `PUBLIC_RELEASES_URL` (list of releases, otherwise the static fallback and a warning) and `PUBLIC_POSTHOG_KEY` (without it, no analytics and no consent banner).

## Tests

Astro rendering tests under Vitest (`bun run test`, never `bun test`, which fails wrongly on Astro components), and `check:content`, run by `lint`: fr/en route parity, forbidden words on `src/content` and `src/pages`, complete legal pages. No Lighthouse runs, neither in CI nor elsewhere: performance is measured by hand.

Content collections do not load in Vitest's Astro container: pages backed by a collection are tested through their **model** (frontmatter on disk, parity of the `en` and `fr` folders) rather than through their rendering, and rendering is kept for what is backed by static data.

## Commands

```bash
bun run dev
bun run build
bun run build:production    # PUPITRE_ENV=production: the legal guard refuses an incomplete page, PUBLIC_RELEASES_URL from the console
bun run deploy:production   # wrangler deploy --env production → pupitre.studio and www
bun run test
bun run check:content     # parity, forbidden words, complete legal pages
```
