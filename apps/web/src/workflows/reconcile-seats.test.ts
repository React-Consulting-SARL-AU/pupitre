import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories"
import { FREE_SERVERS } from "@pupitre/shared/plans"
import { recordSteps } from "@/testing/workflow"
import { RECONCILE_SEATS_STEP, runReconcileSeats } from "./reconcile-seats"
import { batchStep } from "./steps"

const PAID_SEATS = 4

async function organizationWithOneSeatUsed(): Promise<string> {
  const { prisma } = await bootApiTestServer()
  const { organization } = await createOrganizationWithMembers({
    roles: ["owner"],
  })

  await prisma.subscription.create({
    data: {
      organizationId: organization.id,
      stripeSubscriptionId: "sub_reconcile",
      product: "prod_server",
      quantity: PAID_SEATS,
      status: "active",
    },
  })
  for (let index = 0; index <= FREE_SERVERS; index += 1) {
    await createServer({ organizationId: organization.id })
  }

  return organization.id
}

describe("le workflow ReconcileSeats", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("appelle reconcileSeats dans une étape nommée", async () => {
    const organizationId = await organizationWithOneSeatUsed()
    const recorder = recordSteps()

    const report = await runReconcileSeats(recorder.step)

    expect(recorder.names).toEqual([batchStep(RECONCILE_SEATS_STEP, 0)])
    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({
      organization_id: organizationId,
      paid: PAID_SEATS,
      seated: 1,
      drift: 1 - PAID_SEATS,
      applied: false,
    })
  })
})
