# Plan — Site marketing

Workspaces : `apps/site`, `packages/design`. Préfixe `MKT`. `pupitre.studio` présente, documente et fait télécharger. Il ne vend pas lui-même : le bouton de commande ouvre la console.

À lire : [PRODUCT.md](../product/PRODUCT.md) (voix, cibles, prix, anti-références), [DESIGN.md](../product/DESIGN.md), [architecture.md](../architecture.md). Le site peut avancer dès le socle `INF` ; il ne dépend de la plateforme que pour la liste des releases (MKT-04) et du produit que pour les captures réelles.

## Cible

```
apps/site/
├── src/pages/                     index, pricing, download, docs/[...slug], blog/[...slug], changelog, legal/*, fr/**
├── src/content/                   docs/ (MDX), blog/, changelog/, legal/ — fr et en côte à côte
├── src/layouts/                   Base, Docs, Post
├── src/components/                Nav, Footer, Hero, Pricing, ProductShot, Callout, DownloadButton, ThemeToggle
├── src/lib/                       releases.ts (lecture des releases au build), i18n.ts, seo.ts
├── src/styles/                    tokens depuis packages/design, global.css
├── public/                        llms.txt, robots.txt, favicons, og par défaut
├── astro.config.mjs · wrangler.jsonc (Pages) · CLAUDE.md
```

Règles propres au site : Astro 5, Tailwind 4 avec les tokens de `packages/design`, MDX, pas de framework client sauf îlots ciblés, images en AVIF et WebP à quatre largeurs avec dimensions intrinsèques, anglais par défaut et français en `/fr`, chaque page dans les deux langues dans la même passe, aucune chaîne en dur hors des fichiers de contenu.

Les captures produit montrent **l'application réelle**, jamais une maquette. Tant que l'app n'est pas au design monochrome (APP-01), le site ne montre pas de capture : du texte, pas un faux écran.

## Lot S — Le site

### MKT-01 — Socle Astro, tokens, i18n, layout
Lot S · dépend de INF-03 · `apps/site`

Périmètre. Astro 5 sur Cloudflare Pages, Tailwind 4 branché sur `packages/design`, thème clair et sombre par cookie et `prefers-color-scheme`, i18n par dossier (`/` en anglais, `/fr`), layout de base (nav, footer, bascule de thème et de langue), typographie de [DESIGN.md](../product/DESIGN.md) avec Bricolage Grotesque pour les titres, composants `Callout`, `DownloadButton`, `ProductShot` (contrat de perf : `<picture>` AVIF + WebP, quatre largeurs, `sizes`, dimensions intrinsèques, `lazy` sauf `priority`).
Critères d'acceptation.
1. `bun run build` produit un site statique dont chaque page existe en `/` et `/fr`.
2. Aucune couleur en dur hors `packages/design` ; Lighthouse accessibilité et bonnes pratiques à 100 sur une page vide.
Tests. Test Astro de rendu des layouts ; script qui vérifie la parité des routes fr et en.

### MKT-02 — Accueil
Lot S · dépend de MKT-01 · `apps/site`

Périmètre. Une page. Le problème en une phrase (« Vos agents IA travaillent sur une machine à eux. Votre laptop respire. »), ce que fait Pupitre en trois blocs sans icônes décoratives (inspecter et installer, piloter, garder le contrôle), le catalogue de services en liste réelle tirée d'un fichier de contenu partagé avec les tarifs, la promesse « aucune connexion entrante, aucune clé hors de votre laptop, vous gardez tout si vous partez », les deux boutons « Télécharger l'app » et « Commander », une FAQ honnête (pourquoi pas Claude Code web, et si je veux partir, quel VPS choisir, Windows ?). Ton de [PRODUCT.md](../product/PRODUCT.md) : précis, sobre, aucun buzzword.
Critères d'acceptation.
1. Aucun mot de la liste interdite (« AI-powered », « seamless », « blazing », « bank-grade », « secure by design ») ; test automatique sur le contenu.
2. La page tient sans image : le texte porte.
3. LCP sous 1,5 s sur connexion 4G simulée.

### MKT-03 — Tarifs
Lot S · dépend de MKT-01 · `apps/site`

Périmètre. Solo, Team, Hosted (« plus tard ») depuis `packages/shared/src/plans` pour que le site et la console affichent les mêmes prix ; mensuel et annuel ; ce qui se passe à l'arrêt de l'abonnement ; comparatif honnête avec « faire soi-même » ; bouton vers le checkout de la console.
Critères d'acceptation. Un changement de prix dans `packages/shared` change la page sans autre édition.

### MKT-04 — Téléchargement
Lot S · dépend de MKT-01, PLT-06 · `apps/site`

Périmètre. Détection de l'OS, bouton vers la bonne release, liste complète des trois OS, notes de version, configuration requise (macOS 13+, Windows 11, Ubuntu 22.04+ desktop ; un VPS Ubuntu 22.04 ou 24.04 à 4 Go). Les releases sont lues au build depuis l'API de la plateforme, avec un fallback statique.
Critères d'acceptation. Un build sans accès à l'API produit la page avec la dernière liste connue et un avertissement de build.

### MKT-05 — Documentation publique
Lot S · dépend de MKT-01 · `apps/site`

Périmètre. Collection `docs` en MDX : démarrer (choisir un VPS, créer sa clé, connecter l'app), l'onboarding en sept étapes, chaque catégorie du catalogue avec ce que le module fait et demande (source : [service-catalog.md](../contracts/service-catalog.md), réécrit pour le client), projets, agents, éditeurs distants, équipes, sécurité (ce que Pupitre ne peut pas faire sur votre serveur), facturation, FAQ. Layout `Docs` avec sommaire, recherche côté client, liens « modifier » désactivés (dépôt privé).
Critères d'acceptation. Chaque module du catalogue MVP a sa page ; la doc « démarrer » suffit à un testeur pour aller de zéro à un projet en ligne sans aide.

### MKT-06 — Blog et changelog
Lot S · dépend de MKT-01 · `apps/site`

Périmètre. Collections `blog` et `changelog`, flux RSS, deux articles fondateurs (« Claude Code on a VPS: the complete setup » en anglais, « Faire tourner ses agents IA sur un VPS » en français), une entrée de changelog par release lue depuis les notes de version.

### MKT-07 — Pages légales
Lot S · dépend de MKT-01 · `apps/site`

Périmètre. Conditions d'utilisation, licence, politique d'usage acceptable, confidentialité, DPA téléchargeable, mentions de la LLC. Contenu fourni par le propriétaire ; la tâche livre les pages et leur structure, avec des marqueurs `TODO` visibles au build tant que le texte n'est pas là.
Critères d'acceptation. Le build échoue en production s'il reste un `TODO` légal.

### MKT-08 — SEO, Open Graph, `llms.txt`, analytics
Lot S · dépend de MKT-02, MKT-05 · `apps/site`

Périmètre. Balises et données structurées (`SoftwareApplication`, `Organization`, `FAQPage`), Open Graph généré par page en monochrome, `sitemap`, `robots`, `hreflang`, `llms.txt` et `/docs` lisibles par un agent, PostHog avec consentement minimal (pas de cookie avant consentement, page views sans identifiant).
Critères d'acceptation. Validation des données structurées sans erreur ; un agent qui lit `llms.txt` trouve la doc « démarrer » en un saut.

### MKT-09 — Déploiement Cloudflare Pages
Lot S · dépend de MKT-01 · `apps/site`, dashboard

Périmètre. Projet Pages relié au dépôt, `staging.pupitre.studio` sur les PR, `pupitre.studio` sur `main`, en-têtes de sécurité (`CSP`, `HSTS`), redirections `www` et `/fr/` trailing.
Critères d'acceptation. Une PR obtient une URL de prévisualisation ; `main` publie en moins de trois minutes.

### MKT-10 — Refonte du design du site
Lot S · dépend de MKT-01 · `apps/site`

Périmètre. Reprendre tout le site sur le design **accueillant** de [DESIGN.md](../product/DESIGN.md) : surfaces posées par une ombre douce, coins arrondis, échelle typographique reprise, gouttières et sections qui respirent, en-tête collant, pied de page en trois groupes, thème clair et sombre également soignés. Les primitives vivent dans `src/styles/global.css` en `@utility` sur les tokens de `packages/design` : `shell`, `card`, `card-link`, `eyebrow`, `tag`, `mark-dot`, `prose`, l'échelle `display-1` à `heading-4`. Aucune illustration, aucune icône décorative, aucune couleur en dur ; la couleur ne sert que l'état, et l'accueil tient sans une seule image.
Critères d'acceptation.
1. Chaque page du site — accueil, tarifs, téléchargement, doc, blog, changelog, légal, 404 — utilise les mêmes primitives et rend correctement en clair comme en sombre.
2. L'accueil ne contient ni `<img>`, ni `<picture>`, ni `<svg>` ; test automatique.
3. Aucune couleur en dur hors `packages/design` ; les tests de rendu ne dépendent pas d'une classe utilitaire précise.
Tests. Tests de rendu des primitives (`Hero`, `Steps`, `StatusMark`, `Nav`, `Footer`), test « l'accueil tient sans image ».

### MKT-11 — Redirections manquantes vers les tarifs et le téléchargement
Lot S · dépend de MKT-01 · `apps/site`

But. Une adresse tapée à la main aboutit.
Le constat. Le site est en `trailingSlash: "always"`. `apps/site/public/_redirects` rattrape `/fr`, `/docs`, `/blog`, `/changelog` et `/legal`, mais **pas** `/pricing` ni `/download` : une adresse tapée sans barre oblique finale rend une page introuvable, sur les deux pages qui mènent à l'achat et au téléchargement.
Périmètre. Compléter les redirections, et ajouter un test qui échoue si une page de premier niveau n'a pas la sienne, pour que la liste ne se démode plus.
Critères d'acceptation.
1. Chaque page de premier niveau répond avec et sans barre oblique finale.

