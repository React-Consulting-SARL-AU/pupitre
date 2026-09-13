import { describe, expect, test } from "bun:test"
import {
  DRAWN_ONCE,
  DRAWN_PER_ENVIRONMENT,
  type DrawInput,
  drawPublishToken,
  drawSecret,
  drawsFor,
  releaseNoteOf,
} from "../draw-secrets"

const VAULT = "DEV - React Consulting"

const TEMPLATE = [
  "PUPITRE_PLATFORM_URL=https://app.pupitre.studio",
  `PUPITRE_PUBLISH_TOKEN="op://${VAULT}/pupitre-GitHub/PUPITRE_PUBLISH_TOKEN"`,
].join("\n")

const DISAGREEING_NOTES_RE = /pupitre-prod and pupitre-GitHub/
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/
const PUBLISH_TOKEN_RE = /^pupitre_pub_[A-Za-z0-9_-]{43}$/
const UNKNOWN_RELEASE_NOTE_RE = /release note is unknown/

const draw = {
  secret: () => "drawn-secret",
  publishToken: () => "pupitre_pub_drawn",
}

function input(overrides: Partial<DrawInput> = {}): DrawInput {
  return {
    environments: [
      { name: "local", vault: VAULT, item: "pupitre", fields: {} },
      { name: "production", vault: VAULT, item: "pupitre-prod", fields: {} },
    ],
    release: { vault: VAULT, item: "pupitre-GitHub", fields: {} },
    ...overrides,
  }
}

describe("drawsFor", () => {
  test("draws the session secrets of every environment but the workstation", () => {
    const draws = drawsFor(input(), draw)

    for (const field of DRAWN_PER_ENVIRONMENT) {
      expect(draws).toContainEqual({
        vault: VAULT,
        item: "pupitre-prod",
        field,
        value: "drawn-secret",
      })
      expect(
        draws.some((one) => one.item === "pupitre" && one.field === field)
      ).toBe(false)
    }
  })

  test("draws one publish token and deposits it in every note", () => {
    const tokens = drawsFor(input(), draw).filter(
      (one) => one.field === DRAWN_ONCE
    )

    expect(tokens.map((one) => one.item)).toEqual([
      "pupitre",
      "pupitre-prod",
      "pupitre-GitHub",
    ])
    expect(new Set(tokens.map((one) => one.value))).toEqual(
      new Set(["pupitre_pub_drawn"])
    )
  })

  test("copies the publish token a note already holds instead of drawing another", () => {
    const draws = drawsFor(
      input({
        release: {
          vault: VAULT,
          item: "pupitre-GitHub",
          fields: { [DRAWN_ONCE]: "pupitre_pub_existing" },
        },
      }),
      draw
    )
    const tokens = draws.filter((one) => one.field === DRAWN_ONCE)

    expect(tokens.map((one) => one.item)).toEqual(["pupitre", "pupitre-prod"])
    expect(tokens.every((one) => one.value === "pupitre_pub_existing")).toBe(
      true
    )
  })

  test("leaves a held value alone", () => {
    const draws = drawsFor(
      input({
        environments: [
          {
            name: "production",
            vault: VAULT,
            item: "pupitre-prod",
            fields: {
              BETTER_AUTH_SECRET: "kept",
              INTERNAL_WORKFLOW_SECRET: "kept",
              [DRAWN_ONCE]: "pupitre_pub_kept",
            },
          },
        ],
        release: {
          vault: VAULT,
          item: "pupitre-GitHub",
          fields: { [DRAWN_ONCE]: "pupitre_pub_kept" },
        },
      }),
      draw
    )

    expect(draws).toEqual([])
  })

  test("refuses two notes that disagree on the publish token", () => {
    expect(() =>
      drawsFor(
        input({
          environments: [
            {
              name: "production",
              vault: VAULT,
              item: "pupitre-prod",
              fields: { [DRAWN_ONCE]: "pupitre_pub_one" },
            },
          ],
          release: {
            vault: VAULT,
            item: "pupitre-GitHub",
            fields: { [DRAWN_ONCE]: "pupitre_pub_two" },
          },
        }),
        draw
      )
    ).toThrow(DISAGREEING_NOTES_RE)
  })
})

describe("the drawn values", () => {
  test("are long, URL-safe, and never the same twice", () => {
    const one = drawSecret()

    expect(one).toMatch(SECRET_RE)
    expect(drawSecret()).not.toBe(one)
    expect(drawPublishToken()).toMatch(PUBLISH_TOKEN_RE)
  })
})

describe("releaseNoteOf", () => {
  test("finds the release note behind the publish token reference", () => {
    expect(releaseNoteOf(TEMPLATE)).toEqual({
      vault: VAULT,
      item: "pupitre-GitHub",
    })
  })

  test("refuses a template without the reference", () => {
    expect(() => releaseNoteOf("PUPITRE_PUBLISH_TOKEN=plain")).toThrow(
      UNKNOWN_RELEASE_NOTE_RE
    )
  })
})
