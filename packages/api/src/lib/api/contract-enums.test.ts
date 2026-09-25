import { describe, expect, it } from "bun:test"
import {
  AlertKind,
  ReleaseChannel,
  ServerStatus,
} from "@pupitre/db/cloudflare/enums"
import { ALERT_KINDS, SERVER_STATUSES } from "@pupitre/shared/platform-api"
import { RELEASE_CHANNELS } from "@pupitre/shared/releases"

describe("the shared vocabularies", () => {
  it("are the database's, value for value", () => {
    expect(Object.values(ServerStatus).sort()).toEqual(
      [...SERVER_STATUSES].sort()
    )
    expect(Object.values(AlertKind).sort()).toEqual([...ALERT_KINDS].sort())
    expect(Object.values(ReleaseChannel).sort()).toEqual(
      [...RELEASE_CHANNELS].sort()
    )
  })
})
