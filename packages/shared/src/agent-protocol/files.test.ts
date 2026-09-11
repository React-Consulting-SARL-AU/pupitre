import { describe, expect, it } from "bun:test"
import {
  FILE_CHUNK_BYTES,
  FILE_IMAGE_MAX_BYTES,
  FILE_LIST_LIMIT,
  FILE_TEXT_MAX_BYTES,
  FILE_WRITE_MAX_BYTES,
  FsListResultSchema,
  FsReadResultSchema,
  FsRemoveParamsSchema,
  FsStatResultSchema,
  FsWriteParamsSchema,
} from "./files"

const DIGEST = "a".repeat(64)

describe("un listing", () => {
  const listing = {
    path: "projects",
    entries: [
      {
        name: "api",
        kind: "dir",
        size_bytes: 4096,
        modified_at: "2026-09-04T12:00:00Z",
        mode: "0755",
      },
    ],
    truncated: false,
  }

  it("porte le genre, la taille, la date et le mode de chaque entrée", () => {
    expect(FsListResultSchema.safeParse(listing).success).toBe(true)
  })

  it("nomme la racine par un chemin vide", () => {
    expect(FsListResultSchema.safeParse({ ...listing, path: "" }).success).toBe(
      true
    )
  })

  it("refuse un genre hors du contrat et un mode qui n'est pas de l'octal", () => {
    expect(
      FsListResultSchema.safeParse({
        ...listing,
        entries: [{ ...listing.entries[0], kind: "socket" }],
      }).success
    ).toBe(false)
    expect(
      FsListResultSchema.safeParse({
        ...listing,
        entries: [{ ...listing.entries[0], mode: "rwxr-xr-x" }],
      }).success
    ).toBe(false)
  })
})

describe("une fiche", () => {
  const stat = {
    path: "notes.md",
    kind: "file",
    size_bytes: 12,
    modified_at: "2026-09-04T12:00:00Z",
    mode: "0644",
  }

  it("se passe du type et de l'empreinte", () => {
    expect(FsStatResultSchema.safeParse(stat).success).toBe(true)
  })

  it("les porte quand l'agent les connaît", () => {
    expect(
      FsStatResultSchema.safeParse({
        ...stat,
        media_type: "text/plain",
        sha256: DIGEST,
      }).success
    ).toBe(true)
  })
})

describe("une lecture", () => {
  const read = {
    path: "notes.md",
    media_type: "text/plain",
    size_bytes: 12,
    sha256: DIGEST,
    chunks: 1,
  }

  it("rend de quoi vérifier ce qui vient de passer", () => {
    expect(FsReadResultSchema.safeParse(read).success).toBe(true)
  })

  it("refuse un type que le canal ne porte pas et une taille au-delà du plafond", () => {
    expect(
      FsReadResultSchema.safeParse({ ...read, media_type: "application/pdf" })
        .success
    ).toBe(false)
    expect(
      FsReadResultSchema.safeParse({
        ...read,
        size_bytes: FILE_IMAGE_MAX_BYTES + 1,
      }).success
    ).toBe(false)
  })

  it("coupe sur un multiple de trois, si bien que base64 ne complète que le dernier morceau", () => {
    expect(FILE_CHUNK_BYTES % 3).toBe(0)
  })
})

describe("une écriture", () => {
  it("porte le contenu en base64 et l'empreinte de ce qui a été lu", () => {
    expect(
      FsWriteParamsSchema.safeParse({
        path: "notes.md",
        content: "aGVsbG8=",
        sha256: DIGEST,
      }).success
    ).toBe(true)
  })

  it("se passe d'empreinte pour créer un fichier qui n'existait pas", () => {
    expect(
      FsWriteParamsSchema.safeParse({ path: "notes.md", content: "" }).success
    ).toBe(true)
  })

  it("refuse un contenu qui n'est pas du base64", () => {
    expect(
      FsWriteParamsSchema.safeParse({ path: "notes.md", content: "hé !" })
        .success
    ).toBe(false)
  })
})

describe("une suppression", () => {
  it("ne devient récursive que si on le demande", () => {
    expect(FsRemoveParamsSchema.safeParse({ path: "build" }).success).toBe(true)
    expect(
      FsRemoveParamsSchema.safeParse({ path: "build", recursive: true }).success
    ).toBe(true)
    expect(
      FsRemoveParamsSchema.safeParse({ path: "build", force: true }).success
    ).toBe(false)
  })
})

describe("les plafonds", () => {
  it("laissent une image peser plus qu'un texte, et une écriture pas plus qu'un texte", () => {
    expect(FILE_IMAGE_MAX_BYTES).toBeGreaterThan(FILE_TEXT_MAX_BYTES)
    expect(FILE_WRITE_MAX_BYTES).toBe(FILE_TEXT_MAX_BYTES)
    expect(FILE_LIST_LIMIT).toBeGreaterThan(0)
  })
})
