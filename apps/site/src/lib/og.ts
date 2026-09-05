import { readFile } from "node:fs/promises"
import path from "node:path"
import { LIGHT } from "@pupitre/design/tokens"
import { Resvg } from "@resvg/resvg-js"
import satori, { type Font } from "satori"

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

export interface OgCard {
  eyebrow: string
  title: string
  description: string
  footnote: string
}

const FONT_FILES = [
  { file: "BricolageGrotesque-Bold.ttf", name: "Bricolage", weight: 700 },
  { file: "BricolageGrotesque-Regular.ttf", name: "Bricolage", weight: 400 },
  { file: "JetBrainsMono-Medium.ttf", name: "Mono", weight: 500 },
] as const

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts")

let fonts: Font[] | undefined

async function loadFonts(): Promise<Font[]> {
  if (!fonts) {
    fonts = await Promise.all(
      FONT_FILES.map(async (entry) => ({
        name: entry.name,
        weight: entry.weight as Font["weight"],
        style: "normal" as const,
        data: await readFile(path.join(FONT_DIR, entry.file)),
      }))
    )
  }

  return fonts
}

interface Node {
  type: string
  props: Record<string, unknown>
}

const node = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown
): Node => ({ type, props: { style, children } })

const text = (value: string, style: Record<string, unknown>): Node =>
  node("div", style, value)

function markGlyph(): Node {
  return node(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 56,
      height: 56,
      borderRadius: 12,
      background: LIGHT.inverse,
      color: LIGHT["inverse-ink"],
      fontFamily: "Mono",
      fontSize: 24,
      fontWeight: 500,
    },
    ">_"
  )
}

function layout(card: OgCard): Node {
  return node(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: OG_WIDTH,
      height: OG_HEIGHT,
      padding: 64,
      background: LIGHT.base,
      color: LIGHT.ink,
      fontFamily: "Bricolage",
    },
    [
      node("div", { display: "flex", alignItems: "center", gap: 20 }, [
        markGlyph(),
        text("Pupitre", { fontSize: 30, fontWeight: 700, letterSpacing: -0.6 }),
        node("div", { display: "flex", flexGrow: 1 }),
        text(card.eyebrow.toUpperCase(), {
          fontFamily: "Mono",
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: 2,
          color: LIGHT["ink-3"],
        }),
      ]),
      node("div", {
        display: "flex",
        height: 1,
        marginTop: 40,
        background: LIGHT.line,
      }),
      node(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          gap: 28,
        },
        [
          text(card.title, {
            fontSize: card.title.length > 52 ? 60 : 74,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: -2.4,
          }),
          text(card.description, {
            fontSize: 27,
            fontWeight: 400,
            lineHeight: 1.45,
            color: LIGHT["ink-2"],
            maxWidth: 900,
          }),
        ]
      ),
      node("div", {
        display: "flex",
        height: 1,
        marginBottom: 28,
        background: LIGHT.line,
      }),
      text(card.footnote, {
        fontFamily: "Mono",
        fontSize: 20,
        fontWeight: 500,
        color: LIGHT["ink-3"],
      }),
    ]
  )
}

export async function ogImage(card: OgCard): Promise<Uint8Array> {
  const svg = await satori(layout(card) as never, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await loadFonts(),
  })

  return new Resvg(svg, {
    fitTo: { mode: "width", value: OG_WIDTH },
  })
    .render()
    .asPng()
}
