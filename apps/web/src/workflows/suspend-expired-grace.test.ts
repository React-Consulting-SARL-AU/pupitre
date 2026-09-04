import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createOrganizationWithMembers } from "@pupitre/api/testing/factories"
import { recordSteps } from "@/testing/workflow"
import {
  runSuspendExpiredGrace,
  SUSPEND_EXPIRED_GRACE_STEP,
} from "./suspend-expired-grace"

const DAY_MS = 86_400_000

async function serverWithExpiredGrace(): Promise<string> {
  const { prisma } = await bootApiTestServer()
  const { organization } = await createOrganizationWithMembers({
    roles: ["owner"],
  })
  const server = await prisma.server.create({
    data: {
      organizationId: organization.id,
      name: "vps-en-tolerance",
      arch: "amd64",
      status: "grace",
      entitlementValidUntil: new Date(Date.now() - DAY_MS),
    },
  })

  return server.id
}

describe("le workflow SuspendExpiredGrace", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("appelle suspendExpiredGrace dans une étape nommée", async () => {
    const serverId = await serverWithExpiredGrace()
    const recorder = recordSteps()

    const suspended = await runSuspendExpiredGrace(recorder.step)

    expect(suspended).toEqual([serverId])
    expect(recorder.names).toEqual([SUSPEND_EXPIRED_GRACE_STEP])

    const { prisma } = await bootApiTestServer()

    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: serverId } })
    ).toMatchObject({ status: "suspended" })
  })

  it("laisse une tolérance encore ouverte intacte", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const server = await prisma.server.create({
      data: {
        organizationId: organization.id,
        name: "vps-encore-tolere",
        arch: "amd64",
        status: "grace",
        entitlementValidUntil: new Date(Date.now() + DAY_MS),
      },
    })

    expect(await runSuspendExpiredGrace(recordSteps().step)).toEqual([])
    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: server.id } })
    ).toMatchObject({ status: "grace" })
  })
})
