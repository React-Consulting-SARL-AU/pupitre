import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createOrganizationWithMembers } from "@pupitre/api/testing/factories"
import { recordSteps } from "@/testing/workflow"
import {
  EXPIRE_ENROLLMENTS_STEP,
  runExpireEnrollments,
} from "./expire-enrollments"

const HOUR_MS = 3_600_000

async function expiredEnrollment(): Promise<string> {
  const { prisma } = await bootApiTestServer()
  const { organization } = await createOrganizationWithMembers({
    roles: ["owner"],
  })
  const server = await prisma.server.create({
    data: {
      organizationId: organization.id,
      name: "vps-en-attente",
      arch: "amd64",
      status: "enrolling",
      enrollmentTokenHash: "hash-perime",
      enrollmentExpiresAt: new Date(Date.now() - HOUR_MS),
    },
  })

  return server.id
}

describe("le workflow ExpireEnrollments", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("appelle expireEnrollments dans une étape nommée", async () => {
    const serverId = await expiredEnrollment()
    const recorder = recordSteps()

    const expired = await runExpireEnrollments(recorder.step)

    expect(expired).toEqual([serverId])
    expect(recorder.names).toEqual([EXPIRE_ENROLLMENTS_STEP])

    const { prisma } = await bootApiTestServer()

    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: serverId } })
    ).toMatchObject({ status: "revoked" })
  })
})
