import { describe, expect, it } from "bun:test"
import {
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_MAX_OUTBOUND_ATTACHMENTS,
} from "@pupitre/shared/legal"
import {
  attachmentBudget,
  canPreview,
  correspondentLabel,
  lastActivity,
  participantsLine,
  threadStatusLook,
} from "@/lib/domain/inbox"
import { translator } from "@/lib/i18n/i18n"

function file(name: string, size: number): File {
  return new File([new Uint8Array(size)], name)
}

const EARLIER = "2026-09-17T08:00:00.000Z"
const LATER = "2026-09-18T08:00:00.000Z"
const CHANGED = "2026-09-18T09:00:00.000Z"

describe("lastActivity", () => {
  it("names the last inbound email when nothing left after it", () => {
    expect(
      lastActivity({
        last_inbound_at: LATER,
        last_outbound_at: EARLIER,
        updated_at: CHANGED,
      })
    ).toEqual({ key: "inbox.receivedAgo", at: LATER })
  })

  it("names the reply when it is the last thing that happened", () => {
    expect(
      lastActivity({
        last_inbound_at: EARLIER,
        last_outbound_at: LATER,
        updated_at: CHANGED,
      })
    ).toEqual({ key: "inbox.sentAgo", at: LATER })
  })

  it("names the email that exists when only one side has one", () => {
    expect(
      lastActivity({
        last_inbound_at: null,
        last_outbound_at: LATER,
        updated_at: CHANGED,
      })
    ).toEqual({ key: "inbox.sentAgo", at: LATER })
  })

  it("falls back to the change itself when no email carries a date", () => {
    expect(
      lastActivity({
        last_inbound_at: null,
        last_outbound_at: null,
        updated_at: CHANGED,
      })
    ).toEqual({ key: "inbox.changedAgo", at: CHANGED })
  })
})

describe("participantsLine", () => {
  const t = translator("en")

  it("lists the recipients, then the copies", () => {
    expect(
      participantsLine({ to: ["ada@test.local"], cc: ["bo@test.local"] }, t)
    ).toBe("To ada@test.local · Cc bo@test.local")
  })

  it("drops the copies when there are none", () => {
    expect(
      participantsLine({ to: ["ada@test.local", "bo@test.local"], cc: [] }, t)
    ).toBe("To ada@test.local, bo@test.local")
  })

  it("says nothing when the email names nobody", () => {
    expect(participantsLine({ to: [], cc: [] }, t)).toBe("")
  })
})

describe("correspondentLabel", () => {
  it("prefers the name, and falls back to the address", () => {
    expect(correspondentLabel({ email: "ada@test.local", name: "Ada" })).toBe(
      "Ada"
    )
    expect(correspondentLabel({ email: "ada@test.local", name: null })).toBe(
      "ada@test.local"
    )
    expect(correspondentLabel({ email: "ada@test.local", name: "  " })).toBe(
      "ada@test.local"
    )
  })
})

describe("threadStatusLook", () => {
  it("stays monochrome and tells open from closed by its shape", () => {
    expect(threadStatusLook("open")).toEqual({
      shape: "hollow",
      tone: "muted",
      label: "inbox.statusOpen",
    })
    expect(threadStatusLook("closed")).toEqual({
      shape: "filled",
      tone: "muted",
      label: "inbox.statusClosed",
    })
  })
})

describe("attachmentBudget", () => {
  it("sums the files and stays within the shared limit", () => {
    expect(attachmentBudget([file("a.png", 100), file("b.pdf", 200)])).toEqual({
      total: 300,
      over: false,
      blocked: [],
    })
  })

  it("refuses a total past the outbound limit", () => {
    const budget = attachmentBudget([
      file("a.png", MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES),
      file("b.pdf", 1),
    ])

    expect(budget.over).toBe(true)
    expect(budget.total).toBe(MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES + 1)
  })

  it("refuses more files than the outbound limit", () => {
    const files = Array.from(
      { length: MAIL_MAX_OUTBOUND_ATTACHMENTS + 1 },
      (_, i) => file(`${i}.txt`, 1)
    )

    expect(attachmentBudget(files).over).toBe(true)
  })

  it("names every blocked file", () => {
    expect(
      attachmentBudget([
        file("setup.exe", 1),
        file("notes.txt", 1),
        file("run.bat", 1),
      ]).blocked
    ).toEqual(["setup.exe", "run.bat"])
  })
})

describe("canPreview", () => {
  it("shows images and PDFs inline, nothing else", () => {
    expect(canPreview("image/png")).toBe(true)
    expect(canPreview("application/pdf")).toBe(true)
    expect(canPreview("application/octet-stream")).toBe(false)
    expect(canPreview("text/html")).toBe(false)
  })
})
