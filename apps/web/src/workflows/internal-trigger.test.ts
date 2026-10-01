import { describe, expect, it } from "bun:test"
import {
  handleInternalWorkflowTrigger,
  INTERNAL_SECRET_HEADER,
  INTERNAL_WORKFLOW_PREFIX,
} from "./internal-trigger"

const SECRET = "secret-des-declencheurs-internes"

interface TriggeredEnv {
  env: CloudflareEnv
  started: string[]
}

function envWithWorkflows(secret?: string): TriggeredEnv {
  const started: string[] = []
  const workflow = (name: string) => ({
    create: () => {
      started.push(name)

      return Promise.resolve({ id: `instance-${name}` })
    },
  })
  const env = {
    INTERNAL_WORKFLOW_SECRET: secret,
    EXPIRE_ENROLLMENTS: workflow("expire-enrollments"),
    DECOMMISSION_SERVER: workflow("decommission-server"),
    RECONCILE_SEATS: workflow("reconcile-seats"),
    EVALUATE_ALERTS: workflow("evaluate-alerts"),
    SUSPEND_EXPIRED_GRACE: workflow("suspend-expired-grace"),
  } as unknown as CloudflareEnv

  return { env, started }
}

function trigger(name: string, headers: HeadersInit = {}): Request {
  return new Request(
    `https://app.pupitre.studio${INTERNAL_WORKFLOW_PREFIX}${name}`,
    {
      method: "POST",
      headers,
    }
  )
}

describe("the internal workflow trigger", () => {
  it("starts the requested workflow with the shared secret", async () => {
    const { env, started } = envWithWorkflows(SECRET)
    const response = await handleInternalWorkflowTrigger(
      trigger("reconcile-seats", { [INTERNAL_SECRET_HEADER]: SECRET }),
      env
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({
      data: {
        workflow: "reconcile-seats",
        instance_id: "instance-reconcile-seats",
      },
    })
    expect(started).toEqual(["reconcile-seats"])
  })

  it("refuses an invocation without the secret", async () => {
    const { env, started } = envWithWorkflows(SECRET)
    const response = await handleInternalWorkflowTrigger(
      trigger("expire-enrollments"),
      env
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      error: { code: "unauthenticated" },
    })
    expect(started).toEqual([])
  })

  it("refuses an invocation with the wrong secret", async () => {
    const { env, started } = envWithWorkflows(SECRET)
    const response = await handleInternalWorkflowTrigger(
      trigger("expire-enrollments", { [INTERNAL_SECRET_HEADER]: "au-hasard" }),
      env
    )

    expect(response.status).toBe(401)
    expect(started).toEqual([])
  })

  it("refuses everything when the secret is not configured", async () => {
    const { env, started } = envWithWorkflows()
    const response = await handleInternalWorkflowTrigger(
      trigger("expire-enrollments", { [INTERNAL_SECRET_HEADER]: SECRET }),
      env
    )

    expect(response.status).toBe(401)
    expect(started).toEqual([])
  })

  it("ignores an unknown workflow before even reading the secret", async () => {
    const { env, started } = envWithWorkflows(SECRET)
    const response = await handleInternalWorkflowTrigger(
      trigger("purge-tout", { [INTERNAL_SECRET_HEADER]: SECRET }),
      env
    )

    expect(response.status).toBe(404)
    expect(started).toEqual([])
  })

  it("refuses a plain read", async () => {
    const { env, started } = envWithWorkflows(SECRET)
    const request = new Request(
      `https://app.pupitre.studio${INTERNAL_WORKFLOW_PREFIX}reconcile-seats`,
      { headers: { [INTERNAL_SECRET_HEADER]: SECRET } }
    )
    const response = await handleInternalWorkflowTrigger(request, env)

    expect(response.status).toBe(404)
    expect(started).toEqual([])
  })
})
