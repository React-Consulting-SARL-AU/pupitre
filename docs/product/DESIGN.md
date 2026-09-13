---
name: Pupitre
description: Vos agents IA travaillent sur une machine à eux. Votre laptop se rafraîchit.
colors:
  light:
    base: "#ffffff"
    surface: "#f7f7f7"
    sunken: "#efefef"
    raised: "#e6e6e6"
    ink: "#0a0a0a"
    ink-2: "#4a4a4a"
    ink-3: "#676767"
    ink-4: "#838383"
    line: "#e3e3e3"
    line-strong: "#c9c9c9"
    inverse: "#0a0a0a"
    inverse-ink: "#ffffff"
    ok: "#1f7a45"
    warn: "#8a5f00"
    danger: "#b3362a"
    frost: "#2f6cae"
    frost-soft: "#bfdcf3"
  dark:
    base: "#0a0a0a"
    surface: "#111111"
    sunken: "#161616"
    raised: "#1e1e1e"
    ink: "#f5f5f5"
    ink-2: "#c4c4c4"
    ink-3: "#8f8f8f"
    ink-4: "#696969"
    line: "#232323"
    line-strong: "#353535"
    inverse: "#f5f5f5"
    inverse-ink: "#0a0a0a"
    ok: "#4fbe85"
    warn: "#d9a320"
    danger: "#e8705a"
    frost: "#a6d4f2"
    frost-soft: "#5a97cf"
typography:
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Helvetica Neue', sans-serif"
    fontSize: "13px"
    lineHeight: 1.5
  data:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "12px"
  label:
    fontSize: "10.5px"
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  display:
    fontFamily: "'Bricolage Grotesque', -apple-system, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.01em"
radius:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  full: "999px"
space:
  scale: "4px base, steps 1 2 3 4 6 8 12 16 24"
  gutter: "20px"
  section: "32px"
elevation:
  flat: "none"
  raised: "0 1px 2px rgb(0 0 0 / .05), 0 1px 3px rgb(0 0 0 / .06)"
  overlay: "0 4px 12px rgb(0 0 0 / .08), 0 12px 32px rgb(0 0 0 / .10)"
  raised-dark: "0 1px 2px rgb(0 0 0 / .5), 0 1px 3px rgb(0 0 0 / .4)"
  overlay-dark: "0 4px 12px rgb(0 0 0 / .5), 0 12px 32px rgb(0 0 0 / .55)"
motion:
  fast: "120ms ease"
  soft: "180ms cubic-bezier(.2,.6,.3,1)"
  enter: "320ms cubic-bezier(.16,.84,.44,1)"
  exit: "160ms cubic-bezier(.4,0,1,1)"
  stagger: "40ms"
  breathe: "1.6s ease-in-out infinite"
  spinner: "0.9s linear infinite"
---

# Design System

Une interface **monochrome mais accueillante**. Gris neutres, thème clair et thème sombre, aucune couleur d'accent : l'emphase vient du contraste, de la graisse et de l'inversion. Mais la sobriété n'est pas de la sécheresse — l'interface respire, ses surfaces sont posées les unes sur les autres par une ombre douce, ses coins sont arrondis, sa hiérarchie se lit d'un coup d'œil. On doit avoir envie de l'ouvrir.

Trois exceptions à la monochromie, et trois seulement : **l'état** des choses, **les logos des services** que le client installe, dans leurs couleurs d'origine, et **le froid** qui gagne le dernier mot du titre du site. Le reste est gris.

Ce document gouverne l'app desktop, la console web et le site. Un seul système, trois surfaces.

## Tokens

Une échelle de gris neutres, sans teinte. Quatre niveaux de surface pour l'élévation, quatre niveaux d'encre pour la hiérarchie, deux de trait, un couple inversé pour le bouton principal, trois couleurs d'état. Les valeurs sont dans le frontmatter ; `packages/design` les expose en variables CSS et en preset Tailwind 4.

| Token | Rôle |
| --- | --- |
| `base` | fond de la fenêtre ou de la page |
| `surface` | panneaux, barre latérale, cartes |
| `sunken` | champs, zones en creux, terminal |
| `raised` | survol, ligne sélectionnée, menus |
| `ink` | texte principal |
| `ink-2` | texte secondaire |
| `ink-3` | libellés, métadonnées |
| `ink-4` | désactivé, placeholders |
| `line` | séparateurs |
| `line-strong` | bordures de champs, focus discret |
| `inverse`, `inverse-ink` | bouton principal, badge fort : noir sur blanc en clair, blanc sur noir en sombre |
| `ok`, `warn`, `danger` | points d'état, signes de diff. Rien d'autre |
| `frost`, `frost-soft` | le mot qui se rafraîchit dans le titre du site : l'encre, puis la vitre givrée et la buée. Rien d'autre |

**Interdit** : une couleur en dur (`#`, `rgb()`, `oklch()`) dans un composant. Tout passe par un token.

## Règles

- **L'état se lit à la forme d'abord.** En ligne : point plein. Arrêté : cercle vide. En échec : point barré. En cours : point qui respire. La couleur confirme ; l'interface reste lisible en gris purs.
- **L'élévation est une ombre douce, jamais une bordure épaisse.** Trois niveaux seulement : `flat` pour ce qui est dans le flux, `raised` pour une carte ou un panneau posé sur le fond, `overlay` pour ce qui flotte — menu, popover, boîte de dialogue. En thème sombre, l'ombre est plus profonde et se double d'un pas de gris, l'ombre seule n'y suffisant pas. Une carte porte une ombre **ou** un trait, jamais les deux appuyés.
- **Les coins sont arrondis.** `sm` pour un contrôle, `md` pour une carte ou un panneau, `lg` pour une boîte de dialogue ou une fenêtre, `xl` pour les grandes surfaces du site — bloc d'accueil, carte de section, tuile de logo —, `full` pour une pastille. Un rayon plus petit que son parent quand un élément est imbriqué.
- **L'en-tête d'une page est un bandeau à part.** Dans l'app, la barre latérale, la bande de la fenêtre et l'en-tête de la page — logo, libellé, titre, état, faits, contrôles — partagent une même surface `surface` fermée par un trait ; le corps est un puits `base` qui défile sous eux. Ce qui concerne la chose entière — revenir, relire, retirer — se fait dans l'en-tête ; ce qui concerne une section se fait dans la section. L'onboarding, dont le rail dit déjà où l'on est, lit l'en-tête de chaque étape sur la page elle-même.
- **L'espace fait la hiérarchie.** Échelle de 4 px. Une gouttière de 20 px entre les blocs d'un même groupe, 32 px entre deux sections. Un titre de section a plus d'air au-dessus qu'en dessous. Une liste dense reste aérée : 12 px de padding vertical minimum par ligne. Ne jamais serrer pour faire tenir : couper ou faire défiler.
- **Les menus se hiérarchisent en trois plans** : le libellé de groupe en capitales espacées `ink-3`, les entrées en `ink`, l'entrée active sur `raised` avec un repère à gauche. Un séparateur avant une action destructrice. Jamais plus de deux niveaux d'imbrication.
- **Typographie.** Police système pour l'interface à 14 px dans l'app, 13 px dans la console, 15 px sur le site, où le texte se lit de loin et sans clavier. L'app est lue à bout de bras sur un grand écran : elle monte d'un cran, et tout ce qui vit sous le texte courant monte avec. JetBrains Mono pour toute donnée : ports, chemins, commandes, durées, empreintes, versions. Libellés en capitales espacées à 10,5 px, 11,5 px dans l'app. Chiffres tabulaires partout où ils s'alignent. Bricolage Grotesque pour les titres. Interlignage généreux : 1,5 sur le texte courant, 1,2 sur les titres.
- **Icônes d'interface** : Lucide, trait de 1,5 px, jamais remplies, jamais colorées. Un bouton d'action porte son icône avant son libellé.
- **Logos de services** : les vrais, en SVG, dans leurs couleurs d'origine. Voir la section dédiée.
- **Focus.** Anneau de deux pixels en `ink`, décalé de deux pixels. Visible sur les deux thèmes.
- **Mouvement.** Cinq durées, et pas une de plus. `fast` sur les fonds, les traits et les opacités ; `soft` sur ce qui change de taille ou de place sans quitter l'écran ; `enter` sur ce qui arrive ; `exit` sur ce qui part, toujours plus court que ce qui arrive, parce qu'on n'attend jamais un adieu ; `stagger` comme intervalle entre deux frères d'une même cascade, huit au maximum, la neuvième arrivant avec la huitième. Deux animations en boucle, et pas une de plus : `breathe` pour un état en cours — une pastille, une phase, un squelette — et `spinner` pour un contrôle qui travaille. Rien si `prefers-reduced-motion` : l'écran final s'affiche d'un coup, jamais un état intermédiaire figé.
- **Le mouvement dit une direction.** Un pas en avant entre par la droite et sort par la gauche, un retour fait l'inverse : c'est ce qui apprend au lecteur où il est dans une suite d'écrans. Un contenu qui se révèle monte de huit pixels en s'opacifiant, jamais plus — au-delà, l'interface se met à sauter. Une chose qui change d'état ne clignote pas : elle passe d'une forme à l'autre. Rien ne bouge sans qu'un geste, une réponse ou un pas l'ait provoqué : une interface au repos est immobile.
- **Le terminal** garde une palette ANSI, parce que Claude Code, Codex et les outils en dépendent, mais désaturée et adaptée à chaque thème. Fond `sunken`, curseur `ink`, sélection `raised`. Autour de lui, tout est monochrome.
- **L'éditeur de fichiers** colore la syntaxe avec la même palette ANSI que le terminal, et rien d'autre : mot-clé magenta, définition et type bleus, chaîne verte, littéral en `warn` — l'ambre de la palette ne tient pas le contraste sur le thème clair — noms en `ink`, commentaires et ponctuation dans les gris. Le cadre est le même que celui du terminal.
- **Le diff** marque les lignes par le signe et par un fond `ok` ou `danger` à 10 % d'opacité. Lisible sans la couleur.
- **Un QR code est monochrome, et jamais seul.** Modules en `ink` sur un fond `base`, coins `sm`, aucune marque au centre. La chaîne qu'il encode est toujours affichée à côté en `font-data` : un lecteur qui refuse le contraste inversé du thème sombre ne doit jamais bloquer la personne.
- **Chaque geste répond là où il a été fait.** Le premier retour d'un clic est sur le contrôle cliqué, dans les cent millisecondes, et il y reste jusqu'à ce que la réponse soit à l'écran : le bouton passe en attente — le spinner à la place de l'icône, donc à gauche du libellé, `aria-busy`, le bouton indisponible et le curseur en `progress` — et n'en sort qu'une fois le résultat rendu ou l'erreur affichée. Un geste qui change d'écran garde son bouton en attente jusqu'au début de la sortie du panneau, si bien qu'on voit le bouton répondre puis l'écran partir. Un contrôle indisponible dit pourquoi à sa hauteur, jamais dans un bandeau en haut de page.
- **Un écran qui se termine par un geste porte ce geste en bas.** La dernière chose lue est le dernier champ ; une barre collée au bas de la page tient l'action et, à sa gauche, ce qui s'y oppose. Un en-tête ne porte jamais le geste qui termine un formulaire.
- **Une bulle ne porte jamais ce qui décide.** Ce qui décide — un champ requis, une raison de blocage, une erreur — se lit sans geste, sous le champ ou sous la carte. La bulle porte le reste : où trouver une valeur, quelles permissions un jeton demande, ce qu'il en coûte de se tromper. Elle s'ouvre au clic et au clavier, jamais au survol seul, et sa cible fait vingt-huit pixels.
- **L'interface parle à quelqu'un qui n'a jamais ouvert un terminal.** Elle vouvoie, dit ce qui arrive pour la personne et jamais comment l'app s'y prend. Trois plans : un titre de quelques mots qui dit ce qui se passe (« On regarde la machine »), une phrase qui dit ce que ça change pour elle, et un « Détails » replié, fermé par défaut, où vit le comment — chemins, protocoles, sommes de contrôle, canaux, comptes système. Les deux premiers plans n'emploient jamais un mot que la personne n'aurait pas employé : pas de binaire, de sonde, d'enrôlement, d'entrée standard, de heartbeat ; on dit l'agent, on regarde, on déclare, l'accès root. Une donnée technique qui décide — un port, une adresse, la commande qui répare — reste visible, en `font-data` ; celle qui ne décide de rien va sous Détails.
- **Les écrans d'attente disent ce qui se passe** : le titre, ce que ça change, les phases nommées comme la personne les dirait, le compteur, la durée. Jamais un spinner seul, jamais le comment hors de Détails.
- **Les erreurs disent le remède** : ce qui a échoué, pourquoi, la commande ou le bouton qui répare.
- **Une alerte se lit à la forme, et porte son remède.** Point barré pour ce qui est cassé — injoignable, disque plein ; cercle vide pour ce qui va le devenir — agent périmé, droit d'usage en tolérance. Le libellé dit ce qui ne va pas, la ligne en dessous dit quoi faire. Une liste porte un bandeau qui compte les alertes actives et les serveurs touchés ; la fiche porte le détail. Jamais une pastille rouge seule, jamais un compteur sans remède.
- **La page publique de statut ne parle que du service.** L'API répond-elle, la base répond-elle, quelle version de l'agent est publiée, combien de serveurs sont actifs — un compteur agrégé, et rien qui nomme une organisation, une personne ou une machine. Elle s'ouvre sans session, en une seule carte, sans graphique ni historique.

## Accessibilité

Elle n'est pas une passe de finition : un écran qui ne se lit qu'à la souris et qu'à l'œil n'est pas fini.

- **Contraste.** Tout texte en `ink`, `ink-2` ou `ink-3` tient 4,5:1 sur `base`, `surface`, `sunken` et `raised`, dans les deux thèmes. `ok`, `warn` et `danger` tiennent 4,5:1 sur `base`, `surface` et `sunken`, et 3:1 sur `raised`, qui n'est qu'un survol. `ink-4` tient 3:1, et ne porte jamais seul une information : une forme ou un mot le dit aussi. Les valeurs ne se jugent pas à l'œil — `packages/design/src/contrast.test.ts` calcule chaque couple.
- **Focus.** L'anneau partout. Au changement d'écran ou de sous-étape, le focus va au titre de l'étape, si bien qu'un lecteur d'écran dit où l'on arrive et que la tabulation repart du haut du travail. Après un refus, il va au premier champ fautif.
- **Annonces.** Deux régions vivantes dans la coque : `polite` pour ce qui s'est passé — un pas franchi, un module installé, une connexion retrouvée — et `assertive` pour ce qui s'est arrêté. Un compteur d'installation y passe par module, jamais par étape.
- **Formulaires.** `aria-required`, `aria-invalid`, `aria-describedby` vers l'aide, la bulle et le refus. Le refus est une ligne sous le champ, avec son identifiant ; le compte des problèmes est un lien vers le premier.
- **Clavier.** Tout ce qui se clique se tabule et s'active à Entrée et Espace. Une bulle se ferme à Échap.
- **Cibles.** Vingt-huit pixels au minimum pour ce qui se clique, quelle que soit la taille du glyphe.
- **Mouvement.** Rien sous `prefers-reduced-motion`, l'attente d'un bouton comprise : elle devient un changement de glyphe, sans respiration.

## Logos de services

Le catalogue, l'écran Services et les cartes de projet montrent **le vrai logo** de chaque service, en SVG, dans ses couleurs d'origine : PostgreSQL, MySQL, MongoDB, Redis, Node.js, Bun, Python, Java, Go, Docker, GitHub, 1Password, Cloudflare, JetBrains, VS Code, Zed, Claude, Codex, Nous Research, Neon, Caddy. C'est ce qui rend une liste de vingt-six modules lisible en un coup d'œil, et ce qui donne à l'interface sa chaleur sans trahir la monochromie du reste.

- **Où ils vivent** : `packages/design/src/logos/<id>.svg`, un fichier par module du catalogue, nommé par l'identifiant du module (`db.postgres` → `db-postgres.svg`). Ce sont des **fragments inline**, sans déclaration de namespace : ils sont destinés à être insérés dans le document, jamais chargés par un `<img>`. Un composant `ServiceLogo` par surface les rend à taille fixe (16, 20, 24, 32 px), avec un `title` accessible.
- **Provenance** : Simple Icons quand la marque y est (CC0), sinon le SVG du titulaire tel qu'un collecteur le republie, [svgl](https://svgl.app) ou [lobehub](https://lobehub.com/icons) — le fichier d'origine est committé sous `packages/design/scripts/vendor`, et le générateur le réduit à ce que l'app inline : une racine, un `viewBox`, un titre, des identifiants préfixés pour que deux logos posés côte à côte ne se peignent pas l'un l'autre. Un fichier `packages/design/src/logos/NOTICE.md` liste pour chaque logo sa source, sa licence et la date, et sépare les tracés CC0 de ceux qui restent une marque déposée. Usage nominatif : on nomme un logiciel qu'on installe, ce qui est licite ; on ne s'en sert jamais pour suggérer un partenariat.
- **Traitement** : le logo garde ses couleurs, sans filtre ni teinte, posé sur une pastille `surface` aux coins `sm`. Un logo monochrome par nature (GitHub, Zed) prend `ink` et suit donc le thème. Aucun logo n'est déformé, recadré ni recoloré.
- **Une marque hors catalogue** — un produit qu'un module installe sous un autre nom, comme Bun dans `runtime.node` — vit dans le même dossier sous `mark-<id>.svg`, servie par `markFor`. Le site s'en sert pour nommer ce que Pupitre installe ; le reste du produit n'affiche que des logos de modules.
- **Interdits** : un logo comme icône d'action, dans un bouton, ou en filigrane derrière du texte.
- **Une exception, sur le site seulement** : une constellation de logos flotte dans les marges du bloc d'accueil et de l'appel final, hors de la colonne de texte, sur la pastille habituelle, à pleine opacité et sans teinte. Elle est décorative — `aria-hidden`, sans nom lisible — et disparaît sous 1280 px, où la marge n'existe plus. Elle ne remplace pas le mur nommé qui suit : c'est là que les services se lisent.
- **Sans logo licite, pas de logo inventé.** Deux modules n'ont pas de marque à montrer : `core.system` et `core.hardening` ne nomment aucun produit. La retombée doit être aussi soignée que les autres : une icône Lucide dans l'app et la console, un monogramme sur le site.

## Palette ANSI du terminal

| | Clair | Sombre |
| --- | --- | --- |
| black / brightBlack | `#0a0a0a` / `#767676` | `#0a0a0a` / `#5c5c5c` |
| red / brightRed | `#b3362a` / `#c94b3f` | `#e8705a` / `#ff8a72` |
| green / brightGreen | `#1f7a45` / `#2f9457` | `#4fbe85` / `#6fd9a0` |
| yellow / brightYellow | `#9a6a00` / `#b98200` | `#d9a320` / `#f0bc3c` |
| blue / brightBlue | `#2f5f8f` / `#3f75ab` | `#7aa2c8` / `#96bde0` |
| magenta / brightMagenta | `#7a4f78` / `#95648f` | `#c88ec0` / `#dfa8d7` |
| cyan / brightCyan | `#2f7a76` / `#3f9490` | `#6fb5b0` / `#8dd0cb` |
| white / brightWhite | `#4a4a4a` / `#0a0a0a` | `#c4c4c4` / `#f5f5f5` |

## Mise en œuvre

- `packages/design/src/tokens.css` déclare les tokens sous `:root` (clair), les redéfinit sous `:root[data-theme="dark"]` et sous `@media (prefers-color-scheme: dark)` guardé par `:root:not([data-theme="light"])`. Les ombres, les rayons, l'échelle d'espace et les durées sont des tokens au même titre que les couleurs (`--shadow-raised`, `--radius-md`, `--space-4`, `--motion-soft`), et le thème sombre redéfinit les ombres. `packages/design/src/tailwind.css` les expose au `@theme` de Tailwind 4 (`--color-base`, `--radius-md`, `--shadow-overlay`…). `packages/design/src/tokens.ts` en donne la version TypeScript pour le processus principal d'Electron.
- `packages/design/src/tailwind.css` expose le mouvement en utilitaires — `transition-fast`, `transition-soft`, `animate-enter`, `animate-exit`, `animate-breathe` — bâtis sur les tokens `--motion-*`. Un composant n'écrit jamais une durée à la main.
- Un test de `packages/design` calcule les ratios de contraste de chaque encre sur chaque surface, dans les deux thèmes, et échoue si une valeur du frontmatter passe sous son plancher. Une encre ne s'éclaircit donc pas sans que la suite le dise.
- La police d'affichage est embarquée, pas chargée : `packages/design/src/fonts/` porte le woff2 en sous-ensemble latin de la seule graisse utilisée, sa provenance et sa licence (SIL OFL 1.1), et `@pupitre/design/fonts.css` la déclare. L'app desktop l'importe, et rend donc la même chose hors ligne.
- Le choix de thème (`system`, `light`, `dark`) vit avec les préférences de navigation de l'app desktop, dans le `localStorage` de la console, et dans un cookie pour le site. Le thème xterm bascule avec lui.
- La marque est le glyphe `>_` dans un carré aux coins `md` : noir sur blanc en clair, blanc sur noir en sombre. Elle est **définie une fois**, dans `packages/design/src/brand/index.ts` : la géométrie sur une grille de 1024, les deux paires de couleurs, une petite taille optique pour le dessous de vingt-quatre pixels, et un constructeur de SVG. L'icône de l'app Electron (`bun --cwd=apps/desktop run icons`), le favicon du site et le kit de marque en dérivent tous, et un test du site interdit au favicon de diverger.
- **Le kit de marque** est un artefact, pas une source : `bun --cwd=packages/design run brand` écrit dans `packages/design/dist/brand/` tout ce dont la marque a besoin hors des apps — les deux versions du carré en SVG et en PNG de 16 à 1024, les lockups horizontal et vertical avec « Pupitre » vectorisé, les glyphes seuls, `favicon.ico`, les fichiers pour Stripe, l'avatar social, la carte Open Graph, les icônes macOS, Windows, iOS et PWA. Son `README.md` dit quel fichier va où.
- Composants de la console et de l'app : Base UI + shadcn/ui sur Tailwind 4, prop `render` (jamais `asChild`), un composant par fichier. Le site utilise les mêmes tokens en Astro sans bibliothèque de composants.
