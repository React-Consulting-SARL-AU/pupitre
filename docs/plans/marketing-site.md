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
2. L'accueil ne contient ni `<img>` ni `<picture>` ; test automatique. Le `<svg>` y est admis depuis MKT-12, pour les seuls logos de services.
3. Aucune couleur en dur hors `packages/design` ; les tests de rendu ne dépendent pas d'une classe utilitaire précise.
Tests. Tests de rendu des primitives (`Hero`, `Steps`, `StatusMark`, `Nav`, `Footer`), test « l'accueil tient sans image ».

### MKT-11 — Redirections manquantes vers les tarifs et le téléchargement
Lot S · dépend de MKT-01 · `apps/site`

But. Une adresse tapée à la main aboutit.
Le constat. Le site est en `trailingSlash: "always"`. `apps/site/public/_redirects` rattrape `/fr`, `/docs`, `/blog`, `/changelog` et `/legal`, mais **pas** `/pricing` ni `/download` : une adresse tapée sans barre oblique finale rend une page introuvable, sur les deux pages qui mènent à l'achat et au téléchargement.
Périmètre. Compléter les redirections, et ajouter un test qui échoue si une page de premier niveau n'a pas la sienne, pour que la liste ne se démode plus.
Critères d'acceptation.
1. Chaque page de premier niveau répond avec et sans barre oblique finale.

### MKT-12 — Un accueil accueillant : langage courant et logos des services
Lot S · dépend de MKT-02, MKT-10 · `apps/site`, `packages/design`

But. L'accueil parlait à quelqu'un qui sait déjà ce qu'est un VPS. Il doit parler à quelqu'un qui n'en a jamais loué.

Le constat. Sept sections empilées, une carte « rapport d'installation » en style terminal dès le pli, des repères `01`…`07`, et du vocabulaire d'administration système — `ufw`, `fail2ban`, `ed25519`, `tmux` — avant même d'avoir dit à quoi sert le produit. Le tout juste, sobre, et froid.

Périmètre.
- **Le texte.** Accueil réécrit en langage courant dans les deux langues : on loue un serveur, on coche ce qu'on veut, on travaille. Le jargon d'administration quitte l'accueil ; « VPS » ne survit que là où il sert — la réponse qui le définit, et la description pour les moteurs de recherche. Sept étapes deviennent trois, les sept questions sont relues et restent sept, les cartes passent de trois lignes à deux.
- **Le mur de logos.** Sous le pli, une grille des services que Pupitre installe, dans leurs couleurs d'origine, telle que [DESIGN.md](../product/DESIGN.md) l'autorise déjà. Les logos viennent de `@pupitre/design/logos`, jamais d'un fichier posé dans le site.
- **Le catalogue** garde ses noms et ses logos sur l'accueil ; le détail technique reste dans la doc des modules.
- **Le design.** Rayon `xl` pour les grandes surfaces, sections plus hautes, en-têtes de section centrés (`align="center"`, les autres pages gardent l'alignement à gauche), texte du site à 15 px, pastille à la place du filet de l'`eyebrow`.
- **La barre de navigation** devient une pastille flottante : `nav-bar` posée sur un voile dégradé (`nav-veil`) qui efface le texte qui passe dessous, fond translucide et flou, liens en pastille. Tout le site monte d'un cran en arrondis : boutons et contrôles en `full`, cartes et panneaux en `xl`.
- **La taille du texte du site** s'applique enfin : `--font-ui-size` était redéclaré dans un `@layer`, donc perdant face à la déclaration non layerée de `packages/design`.
- **Les marques manquantes.** `packages/design` apprend deux choses : une marque hors catalogue (`MARKS`, pour Bun, que `runtime.node` installe sans le nommer) et une marque reprise à la main quand Simple Icons ne la publie pas (`HAND_SOURCES`, pour Codex, dont l'app desktop portait déjà le tracé). `NOTICE.md` distingue les deux licences.

Critères d'acceptation.
1. L'accueil ne contient plus, hors réponse de FAQ, aucun de ces mots : `VPS`, `SSH`, `ed25519`, `ufw`, `fail2ban`, `tmux`, `systemd` ; test sur le contenu, dans les deux langues.
2. Chaque service du mur porte son logo ou son monogramme, et chaque `<svg>` de la page est un logo de service — un `role="img"` et un `<title>` ; test de rendu.
3. Un module du catalogue MVP a un logo ou une exemption déclarée, marques reprises à la main comprises ; test dans `packages/design`.
4. Les autres pages du site ne bougent pas.

Tests. `home.test.ts` (contenu : le jargon absent, les comptes de sections), `hero.test.ts` (le mur, les logos, l'absence de jargon), `catalog-list.test.ts`, `logos.test.ts` dans `packages/design`.

Reste à faire. `apps/desktop/.../agent-icons.tsx` porte encore ses propres tracés Claude et Codex : ils vivent maintenant dans `@pupitre/design/logos`, à dédupliquer dans une tâche `APP`.

### MKT-13 — Le design accueillant sur tout le site, et un sélecteur de thème qui tient dans un bouton
Lot S · dépend de MKT-12 · `apps/site`, `packages/design`

But. Ce que MKT-12 a fait à l'accueil, les autres pages doivent le porter aussi.

Périmètre.
- **L'échelle de rayons monte d'un cran** dans `packages/design` — `sm` 6→8, `md` 10→12, `lg` 14→18 — donc le site, la console et l'app s'arrondissent ensemble. Le site pousse plus loin : boutons et contrôles en `full`, cartes et panneaux en `xl`.
- **Les en-têtes de page** passent par `<PageHeader>` centré avec une pastille ; un document légal garde son en-tête aligné à gauche (`align="start"`). L'`eyebrow` perd son filet, les repères `01`…`07` disparaissent des sections de tarifs, de téléchargement, de la doc et des articles.
- **Le sélecteur de thème** devient un bouton d'icône qui ouvre un menu — système, clair, sombre, chacun avec son icône et une coche sur l'actif. Il tenait trois segments de texte dans la barre de navigation et dans le pied de page ; il tient maintenant en trente-deux pixels. La console avait déjà ce menu ; l'app desktop garde son champ de réglages, qui est à sa place dans un écran de préférences.
- **Les icônes d'interface du site** vivent dans `<Icon>` : quatre glyphes Lucide inlinés à la main, `aria-hidden`. Le site ne prend pas de dépendance d'icônes pour quatre tracés.
- **Les logos manquants** viennent de [svgl](https://svgl.app) : Visual Studio Code entre au catalogue, Codex prend sa propre marque au lieu du logo OpenAI, Bun passe en couleur. Les fichiers d'origine sont committés sous `packages/design/scripts/vendor` et normalisés par le générateur. `exposure.ssh` et `ai.hermes` restent sans logo : aucune source n'existe, et on n'en invente pas.

Critères d'acceptation.
1. Chaque page rend en clair comme en sombre avec les mêmes primitives, et aucune n'affiche plus de repère numéroté ni de filet d'en-tête.
2. Tout `<svg>` d'une page est déclaré : `role="img"` pour un logo, `aria-hidden` pour une icône d'interface ; test sur l'accueil et sur les tarifs.
3. Un module MVP a un logo ou une exemption motivée ; test dans `packages/design`.
4. Le sélecteur de thème garde ses trois choix accessibles au clavier et nomme le thème actif pour un lecteur d'écran.

Tests. `theme-toggle.test.ts`, `page-header` par les tests de rendu des pages, `logos.test.ts`, et le test des vecteurs déclarés (`src/test/vectors.ts`).


### MKT-14 — Le site mène à la création de compte
Lot S · dépend de PLT-25 · `apps/site`

But. Le bouton principal du site devient « Créer un compte » ; le téléchargement reste, en second.

Périmètre. Le site est aujourd'hui *download-first* : `Nav.astro`, `Hero.astro`, `ClosingCta.astro`, `Pricing.astro` et `Footer.astro` pointent tous vers `/download/`, « Commander » n'apparaît qu'en secondaire dans le hero et sur les cartes de plan, et aucun appel à l'action ne dit « créer un compte ». Or l'app ne sert à rien sans compte ni essai en cours.

- **Les appels à l'action changent de cible.** `src/lib/urls.ts` gagne une adresse d'inscription à côté de `CONSOLE_URL`. Le bouton de `Nav.astro` et le premier bouton de `Hero.astro`, de `ClosingCta.astro` et de `Pricing.astro` mènent à l'inscription ; le second bouton du hero devient le téléchargement. Sur `PlanCard.astro`, « Commander » devient « Démarrer l'essai ». La clé `nav.console` existe dans `src/content/ui/en.ts` et `fr.ts` sans aucun appelant : on la réutilise ou on la remplace, on n'en ajoute pas une troisième.
- **Le parcours se raconte.** Les étapes de `Steps.astro`, portées par `src/content/site/home.fr.ts` et `home.en.ts`, disent les six marches : le site, le compte, l'essai, le téléchargement, la liaison de l'app, l'installation du serveur.
- **La page de téléchargement dit ce qu'elle suppose.** `Download.astro` porte en tête un `Callout` — l'app a besoin d'un compte Pupitre et d'un essai en cours — avec l'inscription en bouton principal au-dessus des trois systèmes. La liste `install.steps` de `src/content/site/download.fr.ts` et `download.en.ts` gagne la connexion au compte en première marche. La page reste publique et indexée.
- **Les tarifs.** La mention `trial` de `pricing.fr.ts` et `pricing.en.ts` cesse d'être une note en prose pour devenir la promesse du bouton. La section `stop`, qui dit ce qui arrive à l'arrêt de l'abonnement, ne bouge pas : elle est juste.

Hors périmètre. Toute page de connexion ou d'inscription sur `pupitre.studio` : le site ne vend pas et ne porte aucune logique de compte, un lien vers la console reste un lien.

Critères d'acceptation.
1. Aucune page ne propose le téléchargement comme action principale ; l'inscription l'est partout où il y a un bouton principal.
2. `/download/` reste publique et dit qu'un compte est nécessaire, en `/` comme en `/fr`.
3. Le script de parité passe : chaque chaîne changée existe en français et en anglais.
4. La copie respecte le registre de `PRODUCT.md` : ni urgence, ni « gratuit » racoleur, ni mot de la liste interdite.

Tests. Les assertions littérales à reprendre vivent dans `src/test/home.test.ts`, `src/components/nav.test.ts`, `src/components/plan-card.test.ts`, `src/test/pricing.test.ts` et `src/test/download.test.ts`.
