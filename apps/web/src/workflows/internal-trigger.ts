import type { ApiErrorCode } from "@pupitre/shared/api/errors"
import { startWorkflow, workflowNamed } from "./registry"

export const INTERNAL_WORKFLOW_PREFIX = "/internal/workflows/"

export const INTERNAL_SECRET_HEADER = "x-pupitre-internal-secret"

function equalsInConstantTime(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }

  let mismatches = 0

  for (let index = 0; index < left.length; index += 1) {
    mismatches += left.charCodeAt(index) === right.charCodeAt(index) ? 0 : 1
  }

  return mismatches === 0
}

export function isInternalTriggerAuthorized(
  request: Request,
  env: CloudflareEnv
): boolean {
  const expected = env.INTERNAL_WORKFLOW_SECRET
  const presented = request.headers.get(INTERNAL_SECRET_HEADER)

  if (!(expected && presented)) {
    return false
  }

  return equalsInConstantTime(expected, presented)
}

function refuse(status: number, code: ApiErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

export async function handleInternalWorkflowTrigger(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  const { pathname } = new URL(request.url)
  const name = workflowNamed(pathname.slice(INTERNAL_WORKFLOW_PREFIX.length))

  if (request.method !== "POST" || !name) {
    return refuse(404, "not_found", "Ce déclencheur interne n'existe pas.")
  }

  if (!isInternalTriggerAuthorized(request, env)) {
    return refuse(
      401,
      "unauthenticated",
      "Le secret des déclencheurs internes est absent ou faux."
    )
  }

  const instanceId = await startWorkflow(env, name)

  return Response.json(
    { data: { workflow: name, instance_id: instanceId } },
    {
      status: 202,
    }
  )
}
