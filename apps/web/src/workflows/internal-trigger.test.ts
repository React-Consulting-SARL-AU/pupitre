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

describe("le déclencheur interne des workflows", () => {
  it("démarre le workflow demandé avec le secret partagé", async () => {
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

  it("refuse une invocation sans le secret", async () => {
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

  it("refuse une invocation avec un mauvais secret", async () => {
    const { env, started } = envWithWorkflows(SECRET)
    const response = await handleInternalWorkflowTrigger(
      trigger("expire-enrollments", { [INTERNAL_SECRET_HEADER]: "au-hasard" }),
      env
    )

    expect(response.status).toBe(401)
    expect(started).toEqual([])
  })

  it("refuse tout quand le secret n'est pas configuré", async () => {
    const { env, started } = envWithWorkflows()
    const response = await handleInternalWorkflowTrigger(
      trigger("expire-enrollments", { [INTERNAL_SECRET_HEADER]: SECRET }),
      env
    )

    expect(response.status).toBe(401)
    expect(started).toEqual([])
  })

  it("ignore un workflow inconnu avant même de lire le secret", async () => {
    const { env, started } = envWithWorkflows(SECRET)
    const response = await handleInternalWorkflowTrigger(
      trigger("purge-tout", { [INTERNAL_SECRET_HEADER]: SECRET }),
      env
    )

    expect(response.status).toBe(404)
    expect(started).toEqual([])
  })

  it("refuse une lecture simple", async () => {
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
