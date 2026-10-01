import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories"
import { recordSteps } from "@/testing/workflow"
import {
  EVALUATE_ALERTS_STEP,
  NOTIFY_ALERTS_STEP,
  runEvaluateAlerts,
} from "./evaluate-alerts"
import { batchStep } from "./steps"

const SILENCE_MS = 1_860_000

async function unreachableServer(): Promise<string> {
  const { prisma } = await bootApiTestServer()
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner"],
  })
  const { server } = await createServer({
    organizationId: organization.id,
    assignedUserId: members[0].user.id,
  })

  await prisma.server.update({
    where: { id: server.id },
    data: { lastHeartbeatAt: new Date(Date.now() - SILENCE_MS) },
  })

  return server.id
}

describe("the EvaluateAlerts workflow", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("calls evaluateAlerts in a named step", async () => {
    const serverId = await unreachableServer()
    const recorder = recordSteps()

    const runs = await runEvaluateAlerts(recorder.step)

    expect(recorder.names).toEqual([
      batchStep(EVALUATE_ALERTS_STEP, 0),
      batchStep(NOTIFY_ALERTS_STEP, 0),
    ])
    expect(runs).toEqual([
      { serverId, opened: ["server_unreachable"], resolved: [] },
    ])

    const { prisma } = await bootApiTestServer()

    expect(
      await prisma.alert.findFirstOrThrow({ where: { serverId } })
    ).toMatchObject({ kind: "server_unreachable", resolvedAt: null })
  })
})
