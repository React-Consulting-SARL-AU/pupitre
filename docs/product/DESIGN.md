---
name: Pupitre
description: Vos agents IA travaillent sur une machine à eux. Votre laptop respire.
colors:
  light:
    base: "#ffffff"
    surface: "#f7f7f7"
    sunken: "#efefef"
    raised: "#e6e6e6"
    ink: "#0a0a0a"
    ink-2: "#4a4a4a"
    ink-3: "#767676"
    ink-4: "#a3a3a3"
    line: "#e3e3e3"
    line-strong: "#c9c9c9"
    inverse: "#0a0a0a"
    inverse-ink: "#ffffff"
    ok: "#1f7a45"
    warn: "#9a6a00"
    danger: "#b3362a"
  dark:
    base: "#0a0a0a"
    surface: "#111111"
    sunken: "#161616"
    raised: "#1e1e1e"
    ink: "#f5f5f5"
    ink-2: "#c4c4c4"
    ink-3: "#8f8f8f"
    ink-4: "#5c5c5c"
    line: "#232323"
    line-strong: "#353535"
    inverse: "#f5f5f5"
    inverse-ink: "#0a0a0a"
    ok: "#4fbe85"
    warn: "#d9a320"
    danger: "#e8705a"
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
  breathe: "1.6s ease-in-out infinite"
---

# Design System

Une interface **monochrome mais accueillante**. Gris neutres, thème clair et thème sombre, aucune couleur d'accent : l'emphase vient du contraste, de la graisse et de l'inversion. Mais la sobriété n'est pas de la sécheresse — l'interface respire, ses surfaces sont posées les unes sur les autres par une ombre douce, ses coins sont arrondis, sa hiérarchie se lit d'un coup d'œil. On doit avoir envie de l'ouvrir.

Deux exceptions à la monochromie, et deux seulement : **l'état** des choses, et **les logos des services** que le client installe, dans leurs couleurs d'origine. Le reste est gris.

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

**Interdit** : une couleur en dur (`#`, `rgb()`, `oklch()`) dans un composant. Tout passe par un token.

## Règles

- **L'état se lit à la forme d'abord.** En ligne : point plein. Arrêté : cercle vide. En échec : point barré. En cours : point qui respire. La couleur confirme ; l'interface reste lisible en gris purs.
- **L'élévation est une ombre douce, jamais une bordure épaisse.** Trois niveaux seulement : `flat` pour ce qui est dans le flux, `raised` pour une carte ou un panneau posé sur le fond, `overlay` pour ce qui flotte — menu, popover, boîte de dialogue. En thème sombre, l'ombre est plus profonde et se double d'un pas de gris, l'ombre seule n'y suffisant pas. Une carte porte une ombre **ou** un trait, jamais les deux appuyés.
- **Les coins sont arrondis.** `sm` pour un contrôle, `md` pour une carte ou un panneau, `lg` pour une boîte de dialogue ou une fenêtre, `xl` pour les grandes surfaces du site — bloc d'accueil, carte de section, tuile de logo —, `full` pour une pastille. Un rayon plus petit que son parent quand un élément est imbriqué.
- **L'espace fait la hiérarchie.** Échelle de 4 px. Une gouttière de 20 px entre les blocs d'un même groupe, 32 px entre deux sections. Un titre de section a plus d'air au-dessus qu'en dessous. Une liste dense reste aérée : 12 px de padding vertical minimum par ligne. Ne jamais serrer pour faire tenir : couper ou faire défiler.
- **Les menus se hiérarchisent en trois plans** : le libellé de groupe en capitales espacées `ink-3`, les entrées en `ink`, l'entrée active sur `raised` avec un repère à gauche. Un séparateur avant une action destructrice. Jamais plus de deux niveaux d'imbrication.
- **Typographie.** Police système pour l'interface à 13 px dans l'app et la console, 15 px sur le site, où le texte se lit de loin et sans clavier. JetBrains Mono pour toute donnée : ports, chemins, commandes, durées, empreintes, versions. Libellés en capitales espacées à 10,5 px. Chiffres tabulaires partout où ils s'alignent. Bricolage Grotesque pour les titres. Interlignage généreux : 1,5 sur le texte courant, 1,2 sur les titres.
- **Icônes d'interface** : Lucide, trait de 1,5 px, jamais remplies, jamais colorées. Un bouton d'action porte son icône avant son libellé.
- **Logos de services** : les vrais, en SVG, dans leurs couleurs d'origine. Voir la section dédiée.
- **Focus.** Anneau de deux pixels en `ink`, décalé de deux pixels. Visible sur les deux thèmes.
- **Mouvement.** `fast` sur les fonds et les opacités, `soft` sur ce qui apparaît ou change de taille. Une seule animation en boucle, `breathe`, pour « en cours ». Rien si `prefers-reduced-motion`.
- **Le terminal** garde une palette ANSI, parce que Claude Code, Codex et les outils en dépendent, mais désaturée et adaptée à chaque thème. Fond `sunken`, curseur `ink`, sélection `raised`. Autour de lui, tout est monochrome.
- **Le diff** marque les lignes par le signe et par un fond `ok` ou `danger` à 10 % d'opacité. Lisible sans la couleur.
- **Un QR code est monochrome, et jamais seul.** Modules en `ink` sur un fond `base`, coins `sm`, aucune marque au centre. La chaîne qu'il encode est toujours affichée à côté en `font-data` : un lecteur qui refuse le contraste inversé du thème sombre ne doit jamais bloquer la personne.
- **Les écrans d'attente disent ce qui se passe** : le module, l'étape, le compteur, la durée. Jamais un spinner seul.
- **Les erreurs disent le remède** : ce qui a échoué, pourquoi, la commande ou le bouton qui répare.
- **Une alerte se lit à la forme, et porte son remède.** Point barré pour ce qui est cassé — injoignable, disque plein ; cercle vide pour ce qui va le devenir — agent périmé, droit d'usage en tolérance. Le libellé dit ce qui ne va pas, la ligne en dessous dit quoi faire. Une liste porte un bandeau qui compte les alertes actives et les serveurs touchés ; la fiche porte le détail. Jamais une pastille rouge seule, jamais un compteur sans remède.
- **La page publique de statut ne parle que du service.** L'API répond-elle, la base répond-elle, quelle version de l'agent est publiée, combien de serveurs sont actifs — un compteur agrégé, et rien qui nomme une organisation, une personne ou une machine. Elle s'ouvre sans session, en une seule carte, sans graphique ni historique.

## Logos de services

Le catalogue, l'écran Services et les cartes de projet montrent **le vrai logo** de chaque service, en SVG, dans ses couleurs d'origine : PostgreSQL, MySQL, MongoDB, Redis, Node.js, Bun, Python, Java, Go, Docker, GitHub, 1Password, Cloudflare, JetBrains, VS Code, Zed, Claude, Codex, Neon, Caddy. C'est ce qui rend une liste de vingt-six modules lisible en un coup d'œil, et ce qui donne à l'interface sa chaleur sans trahir la monochromie du reste.

- **Où ils vivent** : `packages/design/src/logos/<id>.svg`, un fichier par module du catalogue, nommé par l'identifiant du module (`db.postgres` → `db-postgres.svg`). Ce sont des **fragments inline**, sans déclaration de namespace : ils sont destinés à être insérés dans le document, jamais chargés par un `<img>`. Un composant `ServiceLogo` par surface les rend à taille fixe (16, 20, 24, 32 px), avec un `title` accessible.
- **Provenance** : Simple Icons quand la marque y est (CC0), sinon le SVG du titulaire tel que [svgl](https://svgl.app) le collecte — le fichier d'origine est committé sous `packages/design/scripts/vendor`, et le générateur le réduit à ce que l'app inline : une racine, un `viewBox`, un titre, des identifiants préfixés pour que deux logos posés côte à côte ne se peignent pas l'un l'autre. Un fichier `packages/design/src/logos/NOTICE.md` liste pour chaque logo sa source, sa licence et la date, et sépare les tracés CC0 de ceux qui restent une marque déposée. Usage nominatif : on nomme un logiciel qu'on installe, ce qui est licite ; on ne s'en sert jamais pour suggérer un partenariat.
- **Traitement** : le logo garde ses couleurs, sans filtre ni teinte, posé sur une pastille `surface` aux coins `sm`. Un logo monochrome par nature (GitHub, Zed) prend `ink` et suit donc le thème. Aucun logo n'est déformé, recadré ni recoloré.
- **Une marque hors catalogue** — un produit qu'un module installe sous un autre nom, comme Bun dans `runtime.node` — vit dans le même dossier sous `mark-<id>.svg`, servie par `markFor`. Le site s'en sert pour nommer ce que Pupitre installe ; le reste du produit n'affiche que des logos de modules.
- **Interdits** : un logo comme icône d'action, dans un bouton, ou en fond.
- **Sans logo licite, pas de logo inventé.** Quatre modules MVP n'ont pas de marque à montrer : `core.system` et `core.hardening` ne nomment aucun produit, `exposure.ssh` et `ai.hermes` n'ont pas de source. La retombée doit être aussi soignée que les autres : une icône Lucide dans l'app et la console, un monogramme sur le site.

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
- La police d'affichage est embarquée, pas chargée : `packages/design/src/fonts/` porte le woff2 en sous-ensemble latin de la seule graisse utilisée, sa provenance et sa licence (SIL OFL 1.1), et `@pupitre/design/fonts.css` la déclare. L'app desktop l'importe, et rend donc la même chose hors ligne.
- Le choix de thème (`system`, `light`, `dark`) vit avec les préférences de navigation de l'app desktop, dans le `localStorage` de la console, et dans un cookie pour le site. Le thème xterm bascule avec lui.
- La marque est le glyphe `>_` dans un carré aux coins `md` : noir sur blanc en clair, blanc sur noir en sombre. Elle est **définie une fois**, dans `packages/design/src/brand/index.ts` : la géométrie sur une grille de 1024, les deux paires de couleurs, une petite taille optique pour le dessous de vingt-quatre pixels, et un constructeur de SVG. L'icône de l'app Electron (`bun --cwd=apps/desktop run icons`), le favicon du site et le kit de marque en dérivent tous, et un test du site interdit au favicon de diverger.
- **Le kit de marque** est un artefact, pas une source : `bun --cwd=packages/design run brand` écrit dans `packages/design/dist/brand/` tout ce dont la marque a besoin hors des apps — les deux versions du carré en SVG et en PNG de 16 à 1024, les lockups horizontal et vertical avec « Pupitre » vectorisé, les glyphes seuls, `favicon.ico`, les fichiers pour Stripe, l'avatar social, la carte Open Graph, les icônes macOS, Windows, iOS et PWA. Son `README.md` dit quel fichier va où.
- Composants de la console et de l'app : Base UI + shadcn/ui sur Tailwind 4, prop `render` (jamais `asChild`), un composant par fichier. Le site utilise les mêmes tokens en Astro sans bibliothèque de composants.
