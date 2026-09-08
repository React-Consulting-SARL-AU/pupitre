# Plan — la console : retour d'action, navigation, onboarding, accessibilité

Ce document décrit ce que la console web fait mal aujourd'hui, ce qu'on décide, et dans quel ordre on le construit. Il part de l'arbre de travail actuel, qui contient déjà un chantier non commité sur `apps/web` (suppression en deux temps, mutations optimistes, menu de compte dans la barre latérale). Le plan considère ce chantier comme acquis et construit dessus.

C'est un plan de conception, pas un tableau de suivi : les lots de la dernière section se réalisent dans l'ordre, chacun se termine quand ses critères sont vrais, et le document se supprime quand le dernier lot est livré.

Le fil conducteur : la console est la première chose qu'un client voit après le site. Elle doit être comprise sans notice par quelqu'un qui n'a jamais administré un serveur. Chaque geste répond tout de suite, chaque attente dit ce qui se passe, chaque échec dit le remède, et le parcours tient en quatre pas visibles.

## 1. Constat

### 1.1 Une action ne dit pas qu'elle a lieu

Le cas rapporté — révoquer un serveur depuis sa fiche — est exemplaire :

- **Dans `HEAD`**, [server-actions.tsx](../../apps/web/src/components/dashboard/server-actions.tsx) appelait `deleteServer`, puis `invalidateQueries()` sur **tout** le cache, puis `navigate`. Entre le clic et l'arrivée sur la liste : le dialogue s'est fermé, la fiche est intacte, rien ne bouge, rien n'est cliquable utilement. C'est le gel ressenti.
- **Dans l'arbre de travail**, la mutation est optimiste et la révocation reste sur la fiche ; seul l'effacement définitif ramène à la liste, après la réponse du serveur. C'est mieux, mais trois sources se contredisent : le commentaire de [server-deletion.ts](../../apps/web/src/lib/domain/server-deletion.ts) dit que « les deux ramènent à la liste », celui de `server-actions.tsx` dit que « la page reste ouverte », et l'étape e2e « supprimer un serveur ramène à la liste, révoqué » attend l'URL de la liste. Le code ne satisfait pas son propre test.
- **Le dialogue de confirmation ment sur `pending`.** Dans [confirm-dialog.tsx](../../apps/web/src/components/ui/confirm-dialog.tsx), le bouton de confirmation est enveloppé dans `Dialog.Close` : il ferme le dialogue au clic, avant toute réponse. La prop `pending` ne désactive qu'un dialogue qu'on rouvrirait pendant l'appel. Le déclencheur, lui, reste actif : sur une fiche révoquée, deux clics sur « Supprimer définitivement » font deux `DELETE`, et le second répond 404.
- **L'échec arrive après coup, ailleurs.** Le `Callout` d'erreur apparaît sous le bouton de l'en-tête, ou au-dessus de la liste, ou dans la carte avec `m-4`, ou sous le formulaire, selon le composant. Il n'a pas de bouton pour réessayer.
- **Le succès n'est jamais dit**, sauf par des phrases collées : « Enregistré » dans [profile-form.tsx](../../apps/web/src/components/dashboard/profile-form.tsx) reste affiché tant qu'on ne resoumet pas ; « L'invitation est partie » dans [invite-form.tsx](../../apps/web/src/components/dashboard/invite-form.tsx) reste jusqu'à la prochaine ; « Enregistré » dans [organization-card.tsx](../../apps/web/src/components/dashboard/organization-card.tsx) de même. Une révocation d'appareil, une attribution, un effacement de ligne ne disent rien.
- **L'état « en cours » n'a qu'une forme** : bouton désactivé et libellé remplacé (« Suppression… »). Aucun point qui respire, aucun `aria-busy`, aucune marque sur l'élément touché. Dans [server-list.tsx](../../apps/web/src/components/dashboard/server-list.tsx), `purging={purge.isPending}` est passé à **toutes** les lignes, pas à celle qu'on efface.
- **Changer d'organisation garde l'écran de la précédente.** [organization-switcher.tsx](../../apps/web/src/components/dashboard/organization-switcher.tsx) grise son déclencheur, appelle `setActive`, puis `invalidateQueries()` : les données affichées restent celles de l'organisation quittée jusqu'à la fin des refetchs, sans indicateur.
- **Le retour de l'essai recharge tout.** [start-panel.tsx](../../apps/web/src/components/dashboard/start-panel.tsx) enchaîne sur `<a href="/download">` en rechargement complet, alors que `queryKeys.me` vient d'être invalidé : la console sait déjà que l'essai est ouvert.

### 1.2 Chaque page recommence à zéro

- **Aucune route n'a de `loader`.** Les données sont lues dans les composants ; `defaultPreload: "intent"` dans [router.tsx](../../apps/web/src/router.tsx) ne précharge donc rien au survol. Ouvrir une fiche, c'est : en-tête disparu, « Lecture du serveur… » seul, puis tout arrive d'un coup. Aucun `pendingComponent`, aucun `errorComponent`, aucun `notFoundComponent`.
- **[loading-state.tsx](../../apps/web/src/components/ui/loading-state.tsx) remplace le contenu** par une ligne de texte : la page saute à chaque lecture, y compris quand la donnée est déjà en cache et qu'un seul bloc se met à jour.
- **La fiche confond « introuvable » et « injoignable »** : `server.isError` affiche « Ce serveur est introuvable » pour un 404 comme pour une coupure réseau.
- **Le titre du document ne change jamais sous `/dashboard`.** `documentTitle()` existe dans [page-titles.ts](../../apps/web/src/lib/domain/page-titles.ts) et n'est appelé que par les routes d'authentification. Onglet, historique et lecteur d'écran lisent « Pupitre » partout.
- **Rien ne bouge.** [DESIGN.md](../product/DESIGN.md) définit `enter`, `exit`, `stagger` ; [tailwind.css](../../packages/design/src/tailwind.css) n'expose aucun `--motion-*` au `@theme`, et la console n'en utilise aucun. L'app desktop a son utilitaire `transition-soft` ; la console n'a que des `duration-[120ms]` écrits en dur dans chaque `className`.
- **Le focus ne suit pas la navigation.** Un changement de route ne déplace rien ; un lecteur d'écran n'entend pas la nouvelle page. Pas de lien d'évitement vers le contenu.

### 1.3 Accessibilité

- **Le thème clair échoue au contraste AA sur ses propres surfaces.** Ratios calculés sur les tokens du frontmatter de `DESIGN.md` :

  | Encre (clair) | sur `base` | sur `surface` | sur `sunken` | sur `raised` |
  | --- | --- | --- | --- | --- |
  | `ink-3` `#767676` | 4,54 | **4,24** | **3,95** | **3,64** |
  | `warn` `#9a6a00` | 4,73 | **4,42** | **4,12** | **3,79** |
  | `ok` `#1f7a45` | 5,35 | 4,99 | 4,65 | **4,28** |
  | `ink-4` `#a3a3a3` | 2,52 | 2,35 | 2,19 | 2,02 |

  `ink-3` porte les libellés en capitales à 10,5 px, les métadonnées à 12 px, les phrases d'état vide, les tailles de police les plus petites du produit, presque toujours sur `surface` ou `sunken`. Le thème sombre passe partout (`ink-3` ≥ 5,15). `ink-4` ne porte que placeholders et désactivé, ce qui est admis.
- **Une chaîne française hors dictionnaire** : `aria-label` de [usage-bar.tsx](../../apps/web/src/components/dashboard/usage-bar.tsx) écrit « inconnu » et « % » dans un gabarit, ce que le test de parité ne voit pas.
- **Deux `<select>` natifs** stylés à la main ([server-assignment.tsx](../../apps/web/src/components/dashboard/server-assignment.tsx), [audit-log.tsx](../../apps/web/src/components/dashboard/audit-log.tsx)), en `rounded-sm` quand `Input` est en `rounded-md`, sans la primitive Base UI que le guide du workspace impose.
- **La barre latérale n'a pas de nom** (`<nav>` sans `aria-label`, à côté du fil d'Ariane qui en a un).
- **Pas de petit écran.** [dashboard-sidebar.tsx](../../apps/web/src/components/dashboard/dashboard-sidebar.tsx) fait 264 px fixes en `sticky h-dvh`, `main` a `px-10`, et [server-row.tsx](../../apps/web/src/components/dashboard/server-row.tsx) aligne des colonnes à largeur fixe (`w-36`, `w-16`, `w-24`, deux barres de 96 px). Sous 900 px, la ligne déborde. L'email d'alerte ouvre une fiche de serveur ; on le lit sur un téléphone.

### 1.4 L'onboarding n'existe que tant qu'on n'a rien

- **Le texte suppose qu'on sait déjà.** « Le compte et son organisation existent déjà. Il ne manque que l'essai, et c'est lui qui ouvre le produit. » Un nouveau venu ne sait ni ce qu'est une organisation, ni ce que « ouvre le produit » veut dire.
- **Un compte neuf est « suspendu ».** L'API rend `entitlement: suspended` pour une organisation sans abonnement ([platform-api.md](../contracts/platform-api.md)). [sidebar-entitlement.tsx](../../apps/web/src/components/dashboard/sidebar-entitlement.tsx) affiche donc « Droit d'usage suspendu » à quelqu'un qui vient de s'inscrire. La console a pourtant de quoi distinguer : `subscription` est `null` avant l'essai, et porte un `status` après.
- **La barre latérale liste ce qui n'ouvre pas.** Sans essai, Serveurs, Membres, Journal et Appareils sont affichés et renvoient tous sur `/dashboard/start`.
- **Les étapes sont un texte, pas un état.** [start-steps.tsx](../../apps/web/src/components/dashboard/start-steps.tsx) affiche trois pas (essai, téléchargement, enrôlement) sans savoir lesquels sont faits. [download-panel.tsx](../../apps/web/src/components/download/download-panel.tsx) affiche une **autre** liste de trois pas (télécharger, lier, enrôler). Le quatrième pas réel — louer un VPS, celui qui coûte le plus au client — n'apparaît nulle part dans la console ; il vit dans la doc du site (`start/vps`).
- **La liste disparaît dès que l'essai est ouvert.** `/dashboard/start` redirige, la barre latérale ne garde rien, et l'état vide de la liste des serveurs dit « Enrôlez un VPS depuis l'app » avec un seul lien : télécharger. Que l'app soit déjà installée et liée, la console le sait (`/me/devices`) et ne le dit pas.
- **Aucun des quatre pas n'a de « comment »** à portée : où louer, quoi choisir, comment lier l'app, où cliquer dans l'app pour enrôler.

## 2. Décisions

Chacune est à valider par le propriétaire avant le lot qui la porte ; une décision refusée fait tomber le lot correspondant, pas les autres. **Aucun contrat ne bouge** : tout ce que la console a besoin de savoir, `GET /me`, `GET /servers`, `GET /me/devices` et `GET /orgs/:id/subscription` le disent déjà.

### D1 — Une action se lit à trois moments

1. **Au clic** : l'écran montre le résultat tout de suite (mutation optimiste, déjà en place), et l'élément touché porte l'état « en cours » — point qui respire à la place de son point d'état, `aria-busy`, déclencheur désactivé **sur cette ligne seulement**.
2. **À la réponse** : une **notice** le dit en une phrase, au passé, en nommant la chose : « vps-e2e révoqué. Il disparaît le 15 septembre. », « Invitation envoyée à ada@… », « Appareil retiré ». Les phrases collées (« Enregistré ») disparaissent.
3. **À l'échec** : l'écran revient en arrière (déjà en place), et une notice de ton `danger` porte le message et le remède de l'API (`apiFailure`), avec un bouton **Réessayer** qui rejoue la mutation.

La notice est une primitive de `components/ui` : une pile en bas à droite du contenu, trois au plus, six secondes puis sortie (`exit`), pause au survol, `aria-live="polite"` pour le succès et `assertive` pour l'échec, entrée par le bas de huit pixels (`enter`). Elle tient dans le `DashboardShell` et s'alimente par un hook `useNotices()`. `useOptimisticMutation` gagne une option `notice: { done, failed }` pour que chaque mutation la déclare en un endroit.

### D2 — Le dialogue se ferme au clic, le déclencheur porte l'attente

Puisque l'écran montre déjà le résultat, le dialogue n'a rien à attendre : il se ferme au clic (`open` contrôlé, le bouton de confirmation n'est plus un `Dialog.Close`). La prop `pending` devient `busy` sur le déclencheur : désactivé, point qui respire, libellé « Suppression… ». Un dialogue destructeur est un `role="alertdialog"`.

Pour la suppression d'un serveur, ce que fait le prochain clic est **écrit une seule fois**, dans `server-deletion.ts`, et le code comme le test le suivent :

- **Révoquer** reste sur la fiche : elle montre aussitôt « Révoqué », la date de disparition, et son bouton devient « Supprimer définitivement ». La notice le dit. On voit ce qu'on a fait et ce qu'il reste à faire.
- **Effacer** quitte la fiche **tout de suite** vers la liste, où la ligne n'est déjà plus. Si l'appel échoue, la ligne revient et la notice propose « Rouvrir ».

### D3 — Les routes chargent leurs données, et le dire coûte moins qu'un saut

- Chaque route de données (`servers`, `servers/$id`, `members`, `devices`, `billing`, `download`) a un `loader` qui fait `ensureQueryData` sur ses `queryOptions`. `defaultPreload: "intent"` précharge donc au survol, et la fiche s'ouvre avec ses données.
- Un `pendingComponent` par route : le **squelette** de la page — en-tête réel, puis des blocs gris de la hauteur des lignes — affiché après `pendingMs: 150` et tenu `pendingMinMs: 300`, pour n'apparaître que quand l'attente est réelle et ne jamais clignoter. `LoadingState` reste pour les blocs secondaires d'une page déjà ouverte.
- Un `errorComponent` par route : `Callout` avec le message, le remède, et **Réessayer** (`router.invalidate()`). Un `notFoundComponent` sur `servers/$id` : le `loader` lève `notFound()` sur un `ApiError` 404, et rien d'autre.
- `head` sur chaque route de `/dashboard/**` : `documentTitle()` existe, il suffit de l'appeler.
- Changer d'organisation **réinitialise** le cache des clés qui lui appartiennent (`resetQueries`) et ramène sur `/dashboard/servers` : on voit le squelette, jamais l'écran de l'organisation quittée.
- Le retour de l'essai enchaîne par `navigate({ to: "/dashboard/download" })` après invalidation de `me`, sans rechargement.
- La pagination du journal garde la page précédente sous la main (`placeholderData: keepPreviousData`) au lieu de vider la liste.

### D4 — Le mouvement suit `DESIGN.md`, par des tokens

`packages/design/src/tailwind.css` expose `--motion-*` au `@theme` (`--duration-fast`, `--duration-soft`, `--duration-enter`, `--duration-exit`, `--ease-*`) et un jeu d'utilitaires `transition-fast`, `transition-soft`, `animate-enter`, `animate-exit`, sur le modèle du `transition-soft` de l'app desktop. Les `duration-[120ms] ease-[ease]` écrits en dur dans la console passent sur ces utilitaires.

Ensuite, et seulement ensuite : le contenu d'une page **entre** (huit pixels, opacité, `enter`), les lignes d'une liste se suivent avec `stagger` jusqu'à huit, les notices entrent et sortent, un changement de statut passe d'une forme à l'autre. `prefers-reduced-motion` est déjà honoré globalement.

### D5 — Les encres du thème clair montent au contraste AA

Dans `packages/design` et le frontmatter de `DESIGN.md`, dans la même passe : `ink-3` clair `#767676` → `#6b6b6b` (4,63 sur `sunken`), `warn` clair `#9a6a00` → `#8a5f00` (4,91 sur `sunken`). Un test de `packages/design` calcule les ratios et impose ≥ 4,5 pour `ink`, `ink-2`, `ink-3`, `ok`, `warn`, `danger` sur `base`, `surface` et `sunken`, dans les deux thèmes ; `raised` n'est tenu qu'à 3 (survol, icônes). `ink-4` reste réservé aux placeholders et au désactivé, et la console ne l'emploie pour aucun texte courant.

C'est une décision de design, elle touche les trois surfaces ; le site et l'app desktop la reçoivent par le package sans changement de code.

### D6 — L'onboarding est une liste de quatre pas, à état, qui reste tant que le premier serveur n'est pas en ligne

Les quatre pas, dans les mots du client :

1. **Créer votre compte** — toujours fait. La liste commence par une case cochée.
2. **Démarrer l'essai** — fait quand l'organisation a un abonnement (`entitlement` `valid` ou `grace`). Action : le bouton d'essai actuel.
3. **Installer l'app et la lier à votre compte** — fait quand `/me/devices` a au moins un appareil. Action : télécharger pour le système détecté, et une ligne qui dit comment lier (« À l'ouverture, l'app affiche un code : entrez-le sur cette page »).
4. **Louer un serveur et l'ajouter** — en cours quand un serveur est `enrolling`, fait quand un serveur est `active`. Action : un lien vers la page `start/vps` du site (Ubuntu 22.04 ou 24.04, 4 Go, root ou sudo, les hébergeurs), et une ligne qui dit où cliquer dans l'app.

L'état vient d'une fonction de domaine pure, `onboardingSteps({ entitlement, devices, servers })`, testée seule. Le composant `StartChecklist` la dessine : point plein pour fait, point qui respire pour en cours, cercle vide pour à venir, l'action du **premier pas non fait** en bouton principal, les autres repliées.

Où elle vit :

- `/dashboard/start` devient cette liste, avec un titre court et une phrase : « Quatre pas, et votre serveur travaille pour vous. » Le texte sur l'organisation disparaît de cette page.
- L'état vide de `/dashboard/servers` **est** cette liste, ouverte au pas 3 ou 4 selon le cas, à la place de « Enrôlez un VPS depuis l'app ».
- La barre latérale porte « Démarrer · 2/4 » en premier lien tant que la liste n'est pas complète, et ne liste que **ce qui s'ouvre** : sans essai, Serveurs, Membres, Journal et Appareils n'y sont pas.
- La bande « Ce qui reste à faire » de la page de téléchargement est le même composant, réduit aux pas 3 et 4 ; la seconde liste disparaît.
- Le pastille de droit d'usage lit `(entitlement, subscription)` : sans abonnement, elle dit « Essai non démarré » et mène à Démarrer ; avec un abonnement suspendu, « Abonnement suspendu » et mène à la facturation. Un membre sans droit de facturation voit « En attente de l'essai ».

Quand un serveur est `active`, la liste s'efface : `/dashboard/start` redirige vers les serveurs, le lien de la barre latérale disparaît.

### D7 — La console tient sur un téléphone

Sous 1024 px, la barre latérale devient une barre haute : marque, sélecteur d'organisation, bouton **Menu** qui ouvre un panneau latéral (Base UI `Dialog`, entrée par la gauche) avec les mêmes groupes, le droit d'usage, l'app et le menu de compte. `main` passe à `px-4`. Une ligne de serveur se replie : nom et statut sur une ligne, hôte et dernier contact dessous, barres d'usage cachées sous 640 px, action d'effacement gardée. Les cartes de la fiche empilent leurs colonnes (`sm:grid-cols-3` existe déjà). Les formulaires en `flex-wrap` tiennent déjà.

### D8 — Ce qu'un lecteur d'écran et un clavier attendent

Un lien d'évitement « Aller au contenu » en premier élément focusable. À chaque changement de route, le focus va sur le `<h1>` de la page (`tabIndex={-1}`, sans anneau visible). `<nav aria-label>` sur la barre latérale. Une primitive `Select` sur Base UI remplace les deux `<select>` natifs, aux rayons de `Input`. `UsageBar` traduit son `aria-label`. Les régions en cours portent `aria-busy`. Les libellés à 10,5 px restent des libellés : jamais une phrase.

## 3. Ce qu'on ne fait pas

- **Pas de logique métier dans la console.** Les quatre pas sont dérivés de réponses existantes ; aucune route, aucun champ, aucun contrat ne change.
- **Pas d'annulation d'une révocation.** L'API n'en a pas ; la notice dit ce qui s'est passé, elle ne promet pas de le défaire. Le retour en arrière n'existe que sur échec.
- **Pas de temps réel.** La liste garde son rafraîchissement à 5 s ; un mouvement de statut arrive avec lui.
- **Pas de squelette sur chaque carte.** Le squelette est celui de la page ; un bloc secondaire garde `LoadingState`.
- **Ni le site, ni l'app desktop, ni l'API.** Le seul pas hors `apps/web` est `packages/design` (D4, D5), et il n'y change que des tokens et des utilitaires.

## 4. Lots

Dans l'ordre. Chaque lot est vert (lint, typecheck, tests unitaires, e2e) avant le suivant. Français et anglais dans la même passe pour chaque chaîne.

### Lot A — Le retour d'action (D1, D2)

- `components/ui/notice.tsx` et `hooks/use-notices.ts` ; la pile dans `DashboardShell`.
- `ConfirmDialog` : `open` contrôlé, `busy` sur le déclencheur, `alertdialog`.
- `useOptimisticMutation` : option `notice`, et `onError` la déclenche avec `apiFailure` et le rejeu.
- Migration de toutes les mutations : suppression et effacement d'un serveur (fiche et liste, ligne par ligne), révocation d'appareil (compte et fiche), attribution et retrait, invitation et annulation, retrait d'un membre, profil, organisation, sièges, langue. Les phrases collées disparaissent.
- `server-deletion.ts` dit seul ce que fait chaque pas ; les deux commentaires contradictoires tombent ; l'étape e2e attend la fiche révoquée puis la liste après effacement.

Terminé quand : cliquer « Supprimer » sur une fiche montre « Révoqué » avant que la réponse arrive et une notice à la réponse ; cliquer « Supprimer définitivement » ramène sur la liste sans la ligne, dans le même instant ; un échec forcé par le harnais remet la ligne et affiche une notice avec Réessayer ; aucun `isSuccess` ni `phase === "done"` ne pilote plus une phrase à l'écran.

### Lot B — Navigation et mouvement (D3, D4)

- `packages/design` : `--motion-*` au `@theme`, utilitaires `transition-*` et `animate-*`, ligne dans « Mise en œuvre » de `DESIGN.md`.
- `loader`, `pendingComponent`, `errorComponent`, `head` sur chaque route de données ; `notFoundComponent` sur la fiche.
- Un composant `PageSkeleton` par forme de page (liste, fiche, formulaire).
- Sélecteur d'organisation : `resetQueries` par organisation, retour aux serveurs.
- Fin d'essai : `navigate` sans rechargement.
- Entrée du contenu et cascade des lignes.

Terminé quand : survoler une ligne puis cliquer ouvre la fiche sans état de lecture ; couper le réseau sur la fiche affiche l'erreur avec Réessayer ; un identifiant inconnu affiche « introuvable » et rien d'autre ; le titre de l'onglet change à chaque page ; `grep "duration-\["` sur `apps/web/src` ne rend rien ; le test e2e passe sans rechargement entre l'essai confirmé et le téléchargement.

### Lot C — L'onboarding (D6)

- `lib/domain/onboarding.ts` : `onboardingSteps()`, ses tests, les quatre clés de libellé et de remède.
- `components/dashboard/start-checklist.tsx`, et sa refonte de `start-panel.tsx`, `start-steps.tsx` (supprimé), `server-list.tsx` (état vide), `download-panel.tsx` (bande), `dashboard-sidebar.tsx` (lien et compteur, liens masqués), `sidebar-entitlement.tsx` (libellé selon l'abonnement).
- `lib/config/urls.ts` : l'URL de la doc `start/vps` par langue, à côté des pages légales.
- Réécriture des chaînes de `start.ts`, `lists.ts`, `download.ts`, `status.ts` (entitlement) dans les mots du client.
- Le parcours e2e suit : à l'inscription, « Démarrer · 1/4 » ; après l'essai, 2/4 et Serveurs apparaît ; après la liaison de l'app, 3/4 ; après un serveur semé `active`, la liste s'efface.

Terminé quand : un compte neuf ne lit nulle part « suspendu » ; la barre latérale ne liste rien qui redirige ; la même liste de pas est rendue par un seul composant sur les trois pages ; chaque pas non fait porte son action et son « comment » ; le lien vers `start/vps` est le seul renvoi hors console, et il s'ouvre dans la langue du client.

### Lot D — Accessibilité et petits écrans (D5, D7, D8)

- `packages/design` : les deux valeurs, le test de contraste, le frontmatter de `DESIGN.md`.
- `components/ui/select.tsx` sur Base UI ; migration des deux `<select>`.
- Lien d'évitement, focus sur le `<h1>` au changement de route, `aria-label` de la navigation, `aria-busy`, `UsageBar` traduit.
- Barre haute et panneau sous 1024 px ; lignes repliées ; `px-4`.
- Playwright à 390 px sur la connexion, la liaison d'appareil, la liste et la fiche : rien ne déborde horizontalement, le menu s'ouvre et se ferme au clavier.

Terminé quand : le test de contraste est vert dans les deux thèmes ; `bun run test` de `packages/design` échoue si quelqu'un abaisse une encre ; aucun `<select>` natif dans `apps/web/src` ; le test de chaînes françaises attrape désormais un gabarit ; la fiche d'un serveur se lit et se révoque sur 390 px.
