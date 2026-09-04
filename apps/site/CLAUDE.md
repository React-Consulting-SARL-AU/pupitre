# apps/site — Guidelines

`pupitre.studio`, le site. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · plan → [`docs/plans/marketing-site.md`](../../docs/plans/marketing-site.md) · produit et voix → [`PRODUCT.md`](../../docs/product/PRODUCT.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

## Stack imposée

Astro 5 statique sur Cloudflare Pages · Tailwind 4 sur `@pupitre/design` · MDX pour docs, blog, changelog, légal · i18n par dossier, anglais en `/`, français en `/fr` · pas de framework client hors îlots ciblés · images AVIF et WebP à quatre largeurs avec dimensions intrinsèques.

**Banned** : bibliothèques de composants, animations de fond, illustrations, icônes décoratives, couleurs en dur, toute chaîne en dur hors `src/content`.

## Règles

- **La voix de [PRODUCT.md](../../docs/product/PRODUCT.md)** : précise, sobre, technique sans jargon. Mots interdits, vérifiés par test : « AI-powered », « seamless », « blazing », « bank-grade », « secure by design », « revolutionary ».
- **Les captures montrent l'app réelle**, via `<ProductShot>` uniquement, jamais un `<img>` à la main. Pas de capture tant que l'app n'est pas au design monochrome : du texte.
- **Les prix viennent de `@pupitre/shared/plans`.** Le site et la console affichent les mêmes chiffres par construction.
- **Chaque page existe en fr et en en dans la même passe.** Un script vérifie la parité des routes.
- **Le site ne vend pas.** Le bouton de commande ouvre la console ; aucune logique de compte ici.
- **Légal** : les textes viennent du propriétaire ; un `TODO` légal fait échouer le build de production.

## Architecture

```
src/pages/       index · pricing · download · docs/[...slug] · blog/[...slug] · changelog · legal/* · fr/**
src/content/     docs/ · blog/ · changelog/ · legal/ · site/ (accueil, tarifs, FAQ) — fr et en côte à côte
src/layouts/     Base · Docs · Post
src/components/  Nav · Footer · Hero · Pricing · ProductShot · Callout · DownloadButton · ThemeToggle
src/lib/         releases.ts · i18n.ts · seo.ts
public/          llms.txt · robots.txt · favicons
```

## Tests

Tests de rendu Astro, script de parité fr/en, test des mots interdits sur `src/content`, Lighthouse en CI sur l'accueil et une page de doc.

## Commandes

```bash
bun run dev
bun run build
bun run test
bun run check:content     # parité, mots interdits, TODO légaux
```
