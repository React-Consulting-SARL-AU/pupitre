import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createOrganizationWithMembers } from "@pupitre/api/testing/factories"
import { recordSteps } from "@/testing/workflow"
import {
  DECOMMISSION_SERVER_STEP,
  runDecommissionServer,
} from "./decommission-server"
import { batchStep } from "./steps"

const DAY_MS = 86_400_000

async function serverDueForDecommission(): Promise<string> {
  const { prisma } = await bootApiTestServer()
  const { organization } = await createOrganizationWithMembers({
    roles: ["owner"],
  })
  const server = await prisma.server.create({
    data: {
      organizationId: organization.id,
      name: "vps-supprime",
      arch: "amd64",
      status: "revoked",
      decommissionAt: new Date(Date.now() - DAY_MS),
    },
  })

  return server.id
}

describe("le workflow DecommissionServer", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("appelle decommissionDueServers dans une étape nommée", async () => {
    const serverId = await serverDueForDecommission()
    const recorder = recordSteps()

    const decommissioned = await runDecommissionServer(recorder.step)

    expect(decommissioned).toEqual([serverId])
    expect(recorder.names).toEqual([batchStep(DECOMMISSION_SERVER_STEP, 0)])

    const { prisma } = await bootApiTestServer()

    expect(
      await prisma.server.findUnique({ where: { id: serverId } })
    ).toBeNull()
  })
})
