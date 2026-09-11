import { say, VARIABLES } from "./cli"

/**
 * The four requests the chain makes to a platform, through the publication
 * role: declare a version of the agent or of the app, promote either to a
 * channel. A declaration is idempotent on the platform — a row that exists
 * with the same digest answers 200, a different digest is refused — so saying
 * a version twice, or to a second platform, costs nothing and changes nothing.
 */

export interface Platform {
  url: string
  token: string
  dryRun: boolean
}

export interface AgentPublication {
  version: string
  arch: string
  sha256: string
  signature: string
  r2_key: string
  channel: string
}

export interface AppPublication {
  version: string
  os: string
  arch: string
  format: string
  r2_key: string
  bytes: number
  sha256: string
  signature: string
  notes: string
  channel: string
}

export function platformFromEnv(
  url: string,
  env: NodeJS.ProcessEnv,
  dryRun: boolean
): Platform {
  const token = env[VARIABLES.publishToken]

  if (!(token || dryRun)) {
    throw new Error(`${VARIABLES.publishToken} is not set.`)
  }

  return { dryRun, token: token ?? "", url }
}

async function post(
  platform: Platform,
  route: string,
  body: unknown
): Promise<unknown> {
  say(`POST ${platform.url}/api/v1${route}`)

  if (platform.dryRun) {
    say(JSON.stringify(body))

    return null
  }

  const response = await fetch(new URL(`/api/v1${route}`, platform.url), {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${platform.token}`,
      "content-type": "application/json",
    },
    method: "POST",
  })

  if (!response.ok) {
    throw new Error(
      `${route} refused (${response.status}): ${await response.text()}`
    )
  }

  return response.json()
}

export async function declareAgent(
  platform: Platform,
  publication: AgentPublication
): Promise<void> {
  await post(platform, "/admin/releases", publication)
}

export async function declareApp(
  platform: Platform,
  publication: AppPublication
): Promise<void> {
  await post(platform, "/admin/app-releases", publication)
}

export async function promoteAgent(
  platform: Platform,
  version: string,
  channel: string
): Promise<void> {
  await post(platform, `/admin/releases/${version}/promote`, { channel })
}

export async function promoteApp(
  platform: Platform,
  version: string,
  channel: string
): Promise<void> {
  await post(platform, `/admin/app-releases/${version}/promote`, { channel })
}
