import { spawnSync } from "node:child_process"
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  si1password,
  siBun,
  siCaddy,
  siClaudecode,
  siCloudflare,
  siCloudflareworkers,
  siCursor,
  siDocker,
  siGithub,
  siGithubcopilot,
  siGo,
  siGooglechrome,
  siGooglegemini,
  siJetbrains,
  siMongodb,
  siMysql,
  siNeon,
  siNodedotjs,
  siOpencode,
  siPhp,
  siPostgresql,
  siPython,
  siRedis,
  siRuby,
  siZedindustries,
} from "simple-icons"
import { EXEMPTIONS, SOURCES, VENDOR_SOURCES } from "./logo-sources"

interface SimpleIcon {
  title: string
  hex: string
  path: string
  source: string
}

const ICONS: Record<string, SimpleIcon> = {
  "1password": si1password,
  bun: siBun,
  caddy: siCaddy,
  claudecode: siClaudecode,
  cloudflare: siCloudflare,
  cloudflareworkers: siCloudflareworkers,
  cursor: siCursor,
  docker: siDocker,
  github: siGithub,
  githubcopilot: siGithubcopilot,
  go: siGo,
  googlechrome: siGooglechrome,
  googlegemini: siGooglegemini,
  jetbrains: siJetbrains,
  mongodb: siMongodb,
  mysql: siMysql,
  neon: siNeon,
  nodedotjs: siNodedotjs,
  opencode: siOpencode,
  php: siPhp,
  postgresql: siPostgresql,
  python: siPython,
  redis: siRedis,
  ruby: siRuby,
  zedindustries: siZedindustries,
}

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..")
const OUT_DIR = path.join(PACKAGE_ROOT, "src/logos")
const VENDOR_DIR = path.join(PACKAGE_ROOT, "scripts/vendor")
const FORMATTER = path.join(PACKAGE_ROOT, "../../node_modules/.bin/biome")
const RETRIEVED_ON = "2026-09-04"
const LICENSE = "CC0-1.0"
const TRADEMARK = "marque déposée, usage nominatif"
const RANGE_PREFIX_RE = /^\D*/

function simpleIconsVersion(): string {
  const manifest = JSON.parse(
    readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")
  ) as { devDependencies: Record<string, string> }

  return manifest.devDependencies["simple-icons"].replace(RANGE_PREFIX_RE, "")
}

function format(target: string): void {
  spawnSync(FORMATTER, ["check", "--write", target], { stdio: "ignore" })
}

function iconOf(slug: string): SimpleIcon {
  const icon = ICONS[slug]

  if (!icon) {
    throw new Error(`No simple-icons entry wired for "${slug}"`)
  }

  return icon
}

function inlinable(markup: string): string {
  if (markup.includes("`") || markup.includes("${")) {
    throw new Error("Markup cannot be inlined in a template literal")
  }

  return markup
}

function fileOf(moduleId: string): string {
  return `${moduleId.replaceAll(".", "-")}.svg`
}

function markFileOf(id: string): string {
  return `mark-${id}.svg`
}

function svgOf(icon: SimpleIcon, monochrome: boolean): string {
  const fill = monochrome ? "currentColor" : `#${icon.hex.toLowerCase()}`

  return `<svg role="img" viewBox="0 0 24 24" fill="${fill}"><title>${icon.title}</title><path d="${icon.path}"/></svg>\n`
}

const ROOT_TAG_RE = /<svg\b[^>]*>/
const TITLE_RE = /<title>[\s\S]*?<\/title>/g
const XML_DECLARATION_RE = /<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/g
const ID_RE = /\bid="([^"]+)"/g
const STYLE_FILL_RE = /style="([^"]*)"/g
const HEX_FILL_RE = /fill="#[0-9a-fA-F]{3,8}"/g

/** `style="fill:#fbf0df;fill-rule:evenodd"` reads better as plain attributes. */
function attributesFromStyle(markup: string): string {
  return markup.replace(STYLE_FILL_RE, (whole, declarations: string) => {
    const attributes = declarations
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const [property, value] = declaration.split(":").map((s) => s.trim())

        return property && value ? `${property}="${value}"` : null
      })

    return attributes.includes(null) ? whole : attributes.join(" ")
  })
}

/**
 * Several logos are inlined on one page, so their internal ids — `a`, `b`,
 * whatever the exporter emitted — would collide and a gradient would paint the
 * wrong shape. Each file gets its own prefix.
 */
function namespaceIds(markup: string, prefix: string): string {
  const ids = [...markup.matchAll(ID_RE)].map((match) => match[1])
  let out = markup

  for (const id of ids) {
    out = out
      .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
      .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`)
      .replaceAll(`href="#${id}"`, `href="#${prefix}-${id}"`)
  }

  return out
}

/** The root attributes an inlined logo keeps; the rest is exporter noise. */
const KEPT_ROOT_ATTRIBUTES = ["fill", "fill-rule", "clip-rule", "stroke-width"]
const ATTRIBUTE_RE = /([\w:-]+)="([^"]*)"/g

function rootAttributes(root: string): Map<string, string> {
  return new Map(
    [...root.matchAll(ATTRIBUTE_RE)].map(([, name, value]) => [name, value])
  )
}

/** A vendor file, cut down to what the app inlines: one root, a viewBox, a title. */
function vendorSvg(
  raw: string,
  { id, title, monochrome }: { id: string; title: string; monochrome: boolean }
): string {
  const cleaned = attributesFromStyle(
    raw.replace(XML_DECLARATION_RE, "").replace(TITLE_RE, "").trim()
  )
  const root = cleaned.match(ROOT_TAG_RE)?.[0]

  if (!root) {
    throw new Error(`${id}: vendor file has no <svg> root`)
  }

  const attributes = rootAttributes(root)
  const viewBox = attributes.get("viewBox")

  if (!viewBox) {
    throw new Error(`${id}: vendor file has no viewBox`)
  }

  if (monochrome) {
    attributes.set("fill", "currentColor")
  }

  const kept = KEPT_ROOT_ATTRIBUTES.filter((name) => attributes.has(name))
    .map((name) => ` ${name}="${attributes.get(name)}"`)
    .join("")

  const body = namespaceIds(
    cleaned.slice(cleaned.indexOf(root) + root.length),
    id.replaceAll(".", "-")
  )
  const painted = monochrome
    ? body.replace(HEX_FILL_RE, 'fill="currentColor"')
    : body

  return `<svg role="img" viewBox="${viewBox}"${kept}><title>${title}</title>${painted}\n`
}

function noticeOf(rows: string[], markRows: string[]): string {
  return `# Logos de services

Un fichier par module du catalogue qui nomme un produit de marque. La plupart des
tracés viennent de [Simple Icons](https://simpleicons.org) ${simpleIconsVersion()},
publié sous ${LICENSE} ; la couleur de chaque fichier est la couleur de marque que
Simple Icons tient de la source citée.

Les marques que Simple Icons ne publie pas viennent du SVG du titulaire tel qu'un
collecteur le republie — [svgl.app](https://svgl.app),
[lobehub](https://lobehub.com/icons) — la colonne Source disant lequel pour
chaque fichier. L'original est committé sous
\`scripts/vendor\`, le générateur le réduit à ce que l'app inline — une racine, un
\`viewBox\`, un titre, des identifiants préfixés pour que deux logos posés côte à
côte ne se peignent pas l'un l'autre. Ces tracés-là sont en \`${TRADEMARK}\`, pas
sous ${LICENSE}.

Les fichiers sont committés ; \`bun scripts/generate-logos.ts\` les régénère.

**Usage nominatif.** Ces marques appartiennent à leurs titulaires. Pupitre les
affiche pour nommer un logiciel que le client installe sur son propre serveur,
ce que le droit des marques autorise. Pupitre ne s'en sert jamais pour suggérer
un partenariat, une affiliation ou un aval, ni comme icône d'action, ni en
filigrane derrière du texte.

| Fichier | Module | Marque | Source | Licence du tracé | Récupéré le |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

## Marques hors catalogue

Un produit que le site nomme sans qu'il porte le nom de son module : \`runtime.node\`
installe aussi Bun.

| Fichier | Marque | Source | Licence du tracé | Récupéré le |
| --- | --- | --- | --- | --- |
${markRows.join("\n")}

## Modules sans logo

Le catalogue retombe sur une icône Lucide.

| Module | Raison |
| --- | --- |
${Object.entries(EXEMPTIONS)
  .map(([id, reason]) => `| \`${id}\` | ${reason} |`)
  .join("\n")}
`
}

interface Entry {
  id: string
  svg: string
  monochrome: boolean
}

function record(entries: Entry[]): string {
  return entries
    .map(
      ({ id, svg, monochrome }) =>
        `  "${id}": {\n    svg: \`${svg}\`,\n    monochrome: ${monochrome},\n  },`
    )
    .join("\n")
}

function indexOf(entries: Entry[], marks: Entry[]) {
  const logos = record(entries)
  const markLogos = record(marks)

  const exemptions = Object.entries(EXEMPTIONS)
    .map(([id, reason]) => `  "${id}": "${reason}",`)
    .join("\n")

  return `import type { ModuleId } from "@pupitre/shared/catalog"

export interface Logo {
  svg: string
  monochrome: boolean
}

/**
 * Generated by \`scripts/generate-logos.ts\` from the files next to this one.
 * The markup is inlined so Astro, Vite and Electron all read it the same way,
 * without a loader and without a network hop. Do not edit by hand.
 */
export const LOGOS: Readonly<Partial<Record<ModuleId, Logo>>> = {
${logos}
}

/**
 * A brand the site names outside the catalogue, because the module that
 * installs it carries another name.
 */
export const MARKS: Readonly<Record<string, Logo>> = {
${markLogos}
}

/**
 * A module with no logo, and why. An entry here is a decision, not an
 * oversight: the test refuses a catalogue module that has neither.
 */
export const EXEMPTIONS: Readonly<Partial<Record<ModuleId, string>>> = {
${exemptions}
}

/**
 * The catalogue is the agent's, not the app's: a module id it has never heard of
 * is an ordinary answer here, not an error. It simply has no logo.
 */
export function logoFor(moduleId: string): Logo | null {
  return LOGOS[moduleId as ModuleId] ?? null
}

export function markFor(id: string): Logo | null {
  return MARKS[id] ?? null
}
`
}

for (const entry of readdirSync(OUT_DIR)) {
  if (entry.endsWith(".svg")) {
    rmSync(path.join(OUT_DIR, entry))
  }
}

const rows: string[] = []
const markRows: string[] = []

for (const { id, slug, monochrome } of SOURCES) {
  const icon = iconOf(slug)

  writeFileSync(path.join(OUT_DIR, fileOf(id)), svgOf(icon, monochrome))
  rows.push(
    `| \`${fileOf(id)}\` | \`${id}\` | ${icon.title} | ${icon.source} | ${LICENSE} | ${RETRIEVED_ON} |`
  )
}

for (const {
  id,
  title,
  source,
  monochrome,
  mark,
  retrieved,
} of VENDOR_SOURCES) {
  const file = mark ? markFileOf(id) : fileOf(id)
  const raw = readFileSync(path.join(VENDOR_DIR, file), "utf8")

  writeFileSync(
    path.join(OUT_DIR, file),
    vendorSvg(raw, { id, monochrome, title })
  )

  const on = retrieved ?? RETRIEVED_ON
  const row = `| \`${file}\` | ${title} | ${source} | ${TRADEMARK} | ${on} |`

  if (mark) {
    markRows.push(row)
  } else {
    rows.push(
      `| \`${file}\` | \`${id}\` | ${title} | ${source} | ${TRADEMARK} | ${on} |`
    )
  }
}

writeFileSync(path.join(OUT_DIR, "NOTICE.md"), noticeOf(rows, markRows))
format(OUT_DIR)

const read = (file: string) =>
  inlinable(readFileSync(path.join(OUT_DIR, file), "utf8").trim())

const modules = [
  ...SOURCES.map(({ id, monochrome }) => ({
    id,
    monochrome,
    file: fileOf(id),
  })),
  ...VENDOR_SOURCES.filter(({ mark }) => !mark).map(({ id, monochrome }) => ({
    id,
    monochrome,
    file: fileOf(id),
  })),
]

const marks = VENDOR_SOURCES.filter(({ mark }) => mark).map(
  ({ id, monochrome }) => ({ id, monochrome, file: markFileOf(id) })
)

const entries = modules.map(({ id, monochrome, file }) => ({
  id,
  monochrome,
  svg: read(file),
}))

const markEntries = marks.map(({ id, monochrome, file }) => ({
  id,
  monochrome,
  svg: read(file),
}))

writeFileSync(path.join(OUT_DIR, "index.ts"), indexOf(entries, markEntries))
format(path.join(OUT_DIR, "index.ts"))

process.stdout.write(
  `Wrote ${entries.length} logos, ${markEntries.length} mark(s), NOTICE.md and index.ts to src/logos.\n`
)
