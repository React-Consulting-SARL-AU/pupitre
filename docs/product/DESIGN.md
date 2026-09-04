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
  sm: "4px"
  md: "6px"
motion:
  fast: "120ms ease"
  breathe: "1.6s ease-in-out infinite"
---

# Design System

Épuré, noir et blanc, en nuances de gris, avec un thème clair et un thème sombre. Le thème suit le système par défaut et se force dans les réglages. **Il n'y a pas de couleur d'accent** : l'emphase vient du contraste, de la graisse, de l'inversion et du soulignement. La seule couleur admise sert l'état des choses, jamais la décoration.

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
- **Pas d'ombre, pas de dégradé, pas d'illustration.** L'élévation est un pas de gris et un trait d'un pixel. Rayon `sm` pour les contrôles, `md` pour les panneaux, jamais plus.
- **Typographie.** Police système pour l'interface à 13 px. JetBrains Mono pour toute donnée : ports, chemins, commandes, durées, empreintes, versions. Libellés en capitales espacées à 10,5 px. Chiffres tabulaires partout où ils s'alignent. Bricolage Grotesque réservé aux titres du site et de la console.
- **Icônes** Lucide, trait de 1,5 px, jamais remplies, jamais colorées. Un bouton d'action porte son icône avant son libellé.
- **Focus.** Anneau de deux pixels en `ink`, décalé de deux pixels. Visible sur les deux thèmes.
- **Mouvement.** `fast` sur les fonds et les opacités. Une seule animation, `breathe`, pour « en cours ». Rien si `prefers-reduced-motion`.
- **Le terminal** garde une palette ANSI, parce que Claude Code, Codex et les outils en dépendent, mais désaturée et adaptée à chaque thème. Fond `sunken`, curseur `ink`, sélection `raised`. Autour de lui, tout est monochrome.
- **Le diff** marque les lignes par le signe et par un fond `ok` ou `danger` à 10 % d'opacité. Lisible sans la couleur.
- **Les écrans d'attente disent ce qui se passe** : le module, l'étape, le compteur, la durée. Jamais un spinner seul.
- **Les erreurs disent le remède** : ce qui a échoué, pourquoi, la commande ou le bouton qui répare.

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

- `packages/design/src/tokens.css` déclare les tokens sous `:root` (clair), les redéfinit sous `:root[data-theme="dark"]` et sous `@media (prefers-color-scheme: dark)` guardé par `:root:not([data-theme="light"])`. `packages/design/src/tailwind.css` les expose au `@theme` de Tailwind 4 (`--color-base`, `--color-ink`…).
- Le choix de thème (`system`, `light`, `dark`) vit avec les préférences de navigation de l'app desktop, dans le `localStorage` de la console, et dans un cookie pour le site. Le thème xterm bascule avec lui.
- La marque est le glyphe `>_` dans un carré aux coins `md` : noir sur blanc en clair, blanc sur noir en sombre. Icône d'app, favicon et Open Graph en dérivent.
- Composants de la console et de l'app : Base UI + shadcn/ui sur Tailwind 4, prop `render` (jamais `asChild`), un composant par fichier. Le site utilise les mêmes tokens en Astro sans bibliothèque de composants.
