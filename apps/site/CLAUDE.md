# apps/site — Guidelines

`pupitre.studio`, le site. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · produit et voix → [`PRODUCT.md`](../../docs/product/PRODUCT.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

## Stack imposée

Astro 5 statique, servi par un Worker Cloudflare à assets statiques (`wrangler.jsonc`, un Worker par environnement, `worker/index.ts` ne fait que renvoyer `www` vers l'apex) · Tailwind 4 sur `@pupitre/design` · MDX pour docs, blog, légal · i18n par dossier, anglais en `/`, français en `/fr` · pas de framework client hors îlots ciblés · images AVIF et WebP à quatre largeurs avec dimensions intrinsèques.

**Banned** : bibliothèques de composants, animations de fond, illustrations, icônes décoratives, couleurs en dur, toute chaîne en dur hors `src/content`.

## Règles

- **La voix de [PRODUCT.md](../../docs/product/PRODUCT.md)** : précise, sobre, technique sans jargon. Mots interdits, vérifiés par test : « AI-powered », « seamless », « blazing », « bank-grade », « secure by design », « revolutionary ».
- **Les captures montrent l'app réelle**, via `<ProductShot>` uniquement, jamais un `<img>` à la main. Pas de capture tant que l'app n'est pas au design monochrome : du texte.
- **Deux SVG seulement** : un logo de service, lu dans `@pupitre/design/logos` par `<BrandLogo>` dans les couleurs de la marque, et une icône d'interface tracée par `<Icon>` — quatre glyphes Lucide inlinés, `aria-hidden`, jamais décoratifs. Jamais un fichier de logo posé dans le site. Un test refuse tout autre `<svg>`.
- **Les prix viennent de `@pupitre/shared/plans`.** Le site et la console affichent les mêmes chiffres par construction.
- **Chaque page existe en fr et en en dans la même passe.** Un script vérifie la parité des routes.
- **Le site ne vend pas.** Le bouton de commande ouvre la console ; aucune logique de compte ici.
- **Légal** : l'éditeur, les contacts, les origines, le registre des documents et l'avertissement de développement viennent de `@pupitre/shared/legal` ; aucune page n'écrit un nom d'entreprise à la main. Les textes sont des brouillons tant que la société n'est pas immatriculée ; un `TODO` légal fait échouer le build de production. Voir [`docs/legal.md`](../../docs/legal.md).

## Architecture

```
src/pages/       index · pricing · download · integrations · docs/** · blog/** · legal/** · og/[...slug].png · llms.txt · 404 · fr/**
src/content/     docs/{en,fr} · blog/ · legal/ (MDX) · changelog/ (MDX, notes de version lues par la chaîne de release, jamais rendues) · site/ (accueil, tarifs, téléchargement, intégrations, catalogue, doc des modules) · ui/ (chaînes d'interface)
src/layouts/     Base · Docs · Post
src/components/  Nav · Footer · Hero · Steps · Section · PageHeader · Card·like (Feature, Claim) · Pricing · Download · Integrations · Docs* · Callout · ProductShot · StatusMark · Analytics
src/lib/         releases.ts · docs.ts · docs-entries.ts · og.ts · og-pages.ts · feeds.ts · platform.ts · analytics.ts · affiliate.ts (cookie `?ref=` pour la console) · i18n.ts · theme.ts · seo.ts · structured-data.ts
src/assets/fonts Bricolage et JetBrains Mono, lues au build pour les images Open Graph seulement
scripts/         check-content.ts (parité, mots interdits) · legal.ts (garde des TODO légaux, intégration Astro) · redirects.ts (chaque page de premier niveau a sa redirection)
worker/          index.ts — `www` → apex, puis les assets ; rien d'autre
public/          robots.txt · _headers · _redirects · favicons et manifeste, copiés du kit `bun --cwd=packages/design run brand`
```

Le design vit dans `src/styles/global.css` : des `@utility` Tailwind 4 posées sur les tokens de `@pupitre/design` (`shell`, `card`, `card-link`, `eyebrow`, `tag`, `mark-dot`, `prose`, `display-1`…). Un composant n'écrit jamais une valeur de couleur, de rayon ou d'ombre.

Les pages des modules du catalogue sont **générées** depuis `src/content/site/catalog.ts` et `src/content/site/module-docs.ts` : une route `docs/services/[module]` par langue, jamais un fichier MDX par module. `catalog.ts` suit les catégories et l'ordre de `MODULE_CATEGORIES` dans `@pupitre/shared/catalog`, ceux de l'app desktop : la page `/integrations`, l'index de la doc et sa barre latérale regroupent les services par ces catégories.

Le site n'a pas de page changelog : `src/content/changelog/` reste la source des notes de version de la chaîne de release (voir [`docs/monorepo.md`](../../docs/monorepo.md#le-changelog)), sans collection Astro ni route.

Deux variables de build, absentes en local : `PUBLIC_RELEASES_URL` (liste des releases, sinon le fallback statique et un avertissement) et `PUBLIC_POSTHOG_KEY` (sans elle, aucun analytics et aucun bandeau de consentement).

## Tests

Tests de rendu Astro, script de parité fr/en, test des mots interdits sur `src/content`, Lighthouse en CI sur l'accueil et une page de doc.

Les collections de contenu ne se chargent pas dans le conteneur Astro de Vitest : on teste les pages adossées à une collection par leur **modèle** (frontmatter sur le disque, parité des dossiers `en` et `fr`) plutôt que par leur rendu, et on garde le rendu pour ce qui est adossé à des données statiques.

## Commandes

```bash
bun run dev
bun run build
bun run build:production    # PUPITRE_ENV=production : le garde légal refuse un TODO, PUBLIC_RELEASES_URL de la console
bun run deploy:production   # wrangler deploy --env production → pupitre.studio et www
bun run test
bun run check:content     # parité, mots interdits, TODO légaux
```
