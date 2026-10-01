import { describe, expect, it } from "bun:test"
import {
  FILE_IMAGE_MAX_BYTES,
  FILE_LIST_LIMIT,
  FILE_WRITE_MAX_BYTES,
  FsListResultSchema,
  FsReadResultSchema,
  FsRemoveParamsSchema,
  FsStatResultSchema,
  FsWriteParamsSchema,
} from "./files"

const DIGEST = "a".repeat(64)

describe("a listing", () => {
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

  it("carries each entry's kind, size, date and mode", () => {
    expect(FsListResultSchema.safeParse(listing).success).toBe(true)
  })

  it("names the root with an empty path", () => {
    expect(FsListResultSchema.safeParse({ ...listing, path: "" }).success).toBe(
      true
    )
  })

  it("refuses a kind outside the contract and a mode that is not octal", () => {
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

describe("a stat record", () => {
  const stat = {
    path: "notes.md",
    kind: "file",
    size_bytes: 12,
    modified_at: "2026-09-04T12:00:00Z",
    mode: "0644",
  }

  it("does without the type and the fingerprint", () => {
    expect(FsStatResultSchema.safeParse(stat).success).toBe(true)
  })

  it("carries them when the agent knows them", () => {
    expect(
      FsStatResultSchema.safeParse({
        ...stat,
        media_type: "text/plain",
        sha256: DIGEST,
      }).success
    ).toBe(true)
  })
})

describe("a read", () => {
  const read = {
    path: "notes.md",
    media_type: "text/plain",
    size_bytes: 12,
    sha256: DIGEST,
    chunks: 1,
  }

  it("returns what is needed to verify what just went through", () => {
    expect(FsReadResultSchema.safeParse(read).success).toBe(true)
  })

  it("refuses a type the channel does not carry and a size beyond the ceiling", () => {
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
})

describe("a write", () => {
  it("carries the content in base64 and the fingerprint of what was read", () => {
    expect(
      FsWriteParamsSchema.safeParse({
        path: "notes.md",
        content: "aGVsbG8=",
        sha256: DIGEST,
      }).success
    ).toBe(true)
  })

  it("does without a fingerprint to create a file that did not exist", () => {
    expect(
      FsWriteParamsSchema.safeParse({ path: "notes.md", content: "" }).success
    ).toBe(true)
  })

  it("refuses content that is not base64", () => {
    expect(
      FsWriteParamsSchema.safeParse({ path: "notes.md", content: "hé !" })
        .success
    ).toBe(false)
  })
})

describe("a deletion", () => {
  it("only becomes recursive when asked", () => {
    expect(FsRemoveParamsSchema.safeParse({ path: "build" }).success).toBe(true)
    expect(
      FsRemoveParamsSchema.safeParse({ path: "build", recursive: true }).success
    ).toBe(true)
    expect(
      FsRemoveParamsSchema.safeParse({ path: "build", force: true }).success
    ).toBe(false)
  })
})

describe("the ceilings", () => {
  it("let an image weigh more than a write", () => {
    expect(FILE_IMAGE_MAX_BYTES).toBeGreaterThan(FILE_WRITE_MAX_BYTES)
    expect(FILE_LIST_LIMIT).toBeGreaterThan(0)
  })
})
