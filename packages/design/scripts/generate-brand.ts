import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Resvg } from "@resvg/resvg-js"
import {
  glyphSvg,
  type MarkColors,
  markSvg,
  ON_DARK,
  ON_LIGHT,
} from "../src/brand"
import { ico } from "./ico"
import { lockupSvg, stackedLockupSvg, wordmarkSvg } from "./lockup"

const OUT = path.join(import.meta.dir, "../dist/brand")

const MARK_SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024]
const LOCKUP_WIDTHS = [512, 1024, 2048]
const FAVICON_SIZES = [16, 32, 48, 256]

function png(svg: string, width: number, background?: string): Uint8Array {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background,
  })
    .render()
    .asPng()
}

function write(name: string, data: string | Uint8Array): void {
  const file = path.join(OUT, name)

  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, data)
}

const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/
const SVG_TAG_RE = /<\/?svg[^>]*>/g
const TITLE_RE = /<title>[^<]*<\/title>/

const OG = { width: 1200, height: 630, lockup: 560 }

function ogCard(lockup: string, colors: MarkColors): string {
  const box = lockup.match(VIEWBOX_RE)
  const source = { width: Number(box?.[1]), height: Number(box?.[2]) }
  const height = (OG.lockup * source.height) / source.width
  const inner = lockup.replace(SVG_TAG_RE, "").replace(TITLE_RE, "").trim()

  return `<svg width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}" xmlns="http://www.w3.org/2000/svg">
  <title>Pupitre</title>
  <rect width="${OG.width}" height="${OG.height}" fill="${colors.glyph}" />
  <svg x="${(OG.width - OG.lockup) / 2}" y="${(OG.height - height) / 2}" width="${OG.lockup}" height="${height}" viewBox="0 0 ${source.width} ${source.height}">
    ${inner}
  </svg>
</svg>
`
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// Under this, the normal cut closes up and the small one takes over.
const COMPACT_UNDER = 24

const marks = {
  "on-light": markSvg({ colors: ON_LIGHT }),
  "on-dark": markSvg({ colors: ON_DARK }),
}

const compact = {
  "on-light": markSvg({ colors: ON_LIGHT, compact: true }),
  "on-dark": markSvg({ colors: ON_DARK, compact: true }),
}

const iconAt = (variant: keyof typeof marks, size: number): Uint8Array =>
  png(size < COMPACT_UNDER ? compact[variant] : marks[variant], size)

const lockups = {
  "on-light": await lockupSvg(ON_LIGHT),
  "on-dark": await lockupSvg(ON_DARK),
}

const stacked = {
  "on-light": await stackedLockupSvg(ON_LIGHT),
  "on-dark": await stackedLockupSvg(ON_DARK),
}

// Bleeds to the edge for a round avatar or a maskable icon; the glyph stays well inside either crop.
const bleeding = markSvg({ colors: ON_LIGHT, background: ON_LIGHT.square })

const wordmarks = {
  black: await wordmarkSvg(ON_LIGHT.square),
  white: await wordmarkSvg(ON_DARK.square),
}

write("svg/mark-adaptive.svg", markSvg({ adaptive: true }))
write("svg/mark-adaptive-small.svg", markSvg({ adaptive: true, compact: true }))
write("svg/glyph-white.svg", glyphSvg(ON_LIGHT.glyph))
write("svg/glyph-black.svg", glyphSvg(ON_LIGHT.square))

for (const [variant, svg] of Object.entries(marks)) {
  write(`svg/mark-${variant}.svg`, svg)
  write(`svg/mark-${variant}-small.svg`, compact[variant as keyof typeof marks])
  for (const size of MARK_SIZES) {
    write(
      `png/mark-${variant}-${size}.png`,
      iconAt(variant as keyof typeof marks, size)
    )
  }
}

for (const [variant, svg] of Object.entries(lockups)) {
  write(`svg/lockup-${variant}.svg`, svg)
  for (const width of LOCKUP_WIDTHS) {
    write(`png/lockup-${variant}-${width}.png`, png(svg, width))
  }
}

for (const [variant, svg] of Object.entries(stacked)) {
  write(`svg/lockup-stacked-${variant}.svg`, svg)
  for (const width of LOCKUP_WIDTHS) {
    write(`png/lockup-stacked-${variant}-${width}.png`, png(svg, width))
  }
}

for (const [variant, svg] of Object.entries(wordmarks)) {
  write(`svg/wordmark-${variant}.svg`, svg)
  write(`png/wordmark-${variant}-1024.png`, png(svg, 1024))
}

write(
  "favicon.ico",
  ico(FAVICON_SIZES.map((size) => ({ size, png: iconAt("on-light", size) })))
)

// Stripe shows both on a white or near-white surface.
write("stripe/icon-512.png", png(marks["on-light"], 512))
write("stripe/logo-1024.png", png(lockups["on-light"], 1024))

write("social/avatar-1024.png", png(bleeding, 1024))
write(
  "social/og-1200x630.png",
  png(ogCard(lockups["on-light"], ON_LIGHT), 1200)
)
write(
  "social/og-1200x630-dark.png",
  png(ogCard(lockups["on-dark"], ON_DARK), 1200)
)

write(
  "app/apple-touch-icon-180.png",
  png(marks["on-light"], 180, ON_LIGHT.square)
)
write("app/pwa-192.png", png(marks["on-light"], 192))
write("app/pwa-512.png", png(marks["on-light"], 512))
write("app/pwa-maskable-512.png", png(bleeding, 512))
// Apple's grid and corner radius rather than ours, so the icon sits right among its Dock siblings.
write(
  "app/macos-1024.png",
  png(markSvg({ colors: ON_LIGHT, inset: 100, radius: 185 }), 1024)
)
write(
  "app/windows.ico",
  ico(
    [16, 32, 48, 64, 128, 256].map((size) => ({
      size,
      png: iconAt("on-light", size),
    }))
  )
)

write("README.md", readme())

function readme(): string {
  return `# Kit de marque Pupitre

Généré par \`bun --cwd=packages/design run brand\` depuis
\`packages/design/src/brand/index.ts\`, la seule définition de la marque. Ce
dossier n'est pas dans Git : on le régénère, on ne le corrige pas.

La marque est le glyphe \`>_\` dans un carré aux coins \`md\`. Deux versions, et
deux seulement : **on-light** (carré noir, glyphe blanc) pour un fond clair,
**on-dark** (carré blanc cassé, glyphe noir) pour un fond sombre. Pas de
couleur, jamais.

## Où va quoi

| Besoin | Fichier |
| --- | --- |
| Stripe → Paramètres → Image de marque, « icône » | \`stripe/icon-512.png\` |
| Stripe → Paramètres → Image de marque, « logo » | \`stripe/logo-1024.png\` |
| Avatar d'un compte social, d'un profil GitHub | \`social/avatar-1024.png\` |
| Aperçu Open Graph d'une page qui n'en a pas | \`social/og-1200x630.png\` |
| Favicon d'un site tiers | \`favicon.ico\` ou \`svg/mark-adaptive.svg\` |
| Icône installée sur iOS | \`app/apple-touch-icon-180.png\` |
| Icône d'une PWA | \`app/pwa-192.png\`, \`app/pwa-512.png\`, \`app/pwa-maskable-512.png\` |
| Icône d'app macOS | \`app/macos-1024.png\` |
| Icône d'app Windows | \`app/windows.ico\` |
| Un logo dans une présentation, un article, un partenaire | \`svg/lockup-on-light.svg\` |
| Un logo vertical, sous un titre | \`svg/lockup-stacked-on-light.svg\` |

Les fichiers \`-small\` sont la **petite taille optique** : le même dessin, un
peu plus grand et plus gras, parce qu'en dessous de vingt-quatre pixels le
chevron du dessin normal se referme. Les PNG de 16 px et les entrées 16 px des
\`.ico\` en sortent déjà ; au-dessus, c'est le dessin normal.

Les PNG ont un fond transparent, sauf \`apple-touch-icon\` (iOS ne gère pas la
transparence) et les cartes Open Graph. Les SVG ne contiennent aucun texte
vivant : « Pupitre » y est vectorisé, donc rien ne dépend de la présence de
Bricolage Grotesque sur la machine qui affiche le fichier.

## Ce qu'on ne fait pas

- Recolorer la marque, la dégrader, l'ombrer, la mettre en relief.
- Séparer le glyphe de son carré, sauf avec \`svg/glyph-*.svg\`, prévu pour ça.
- Étirer le lockup : il se redimensionne, il ne se déforme pas.
- Poser la version \`on-light\` sur un fond sombre, ou l'inverse.
- Laisser moins que la moitié de la hauteur du carré comme marge autour du
  lockup.
`
}

console.log(`brand kit written to ${path.relative(process.cwd(), OUT)}`)
