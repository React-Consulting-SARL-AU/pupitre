export interface AuthEnv {
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  VITE_APP_URL?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

export type EnvSource = Record<string, string | undefined>

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])
const IPV4_HOST_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/

function optionalVariable(source: EnvSource, name: string): string | undefined {
  const value = source[name]?.trim()

  return value ? value : undefined
}

function requireVariable(source: EnvSource, name: string): string {
  const value = optionalVariable(source, name)

  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

export function readAuthEnv(source: EnvSource): AuthEnv {
  return {
    BETTER_AUTH_SECRET: requireVariable(source, "BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: requireVariable(source, "BETTER_AUTH_URL"),
    VITE_APP_URL: optionalVariable(source, "VITE_APP_URL"),
    GITHUB_CLIENT_ID: optionalVariable(source, "GITHUB_CLIENT_ID"),
    GITHUB_CLIENT_SECRET: optionalVariable(source, "GITHUB_CLIENT_SECRET"),
    GOOGLE_CLIENT_ID: optionalVariable(source, "GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: optionalVariable(source, "GOOGLE_CLIENT_SECRET"),
  }
}

export function originOf(url: string): string {
  return new URL(url).origin
}

export function isLocalhostUrl(url: string): boolean {
  return LOOPBACK_HOSTS.has(new URL(url).hostname)
}

export function consoleUrl(env: AuthEnv): string {
  return originOf(env.VITE_APP_URL ?? env.BETTER_AUTH_URL)
}

export function trustedOrigins(env: AuthEnv): string[] {
  const origins = [originOf(env.BETTER_AUTH_URL)]

  if (env.VITE_APP_URL) {
    origins.push(originOf(env.VITE_APP_URL))
  }

  return [...new Set(origins)]
}

/** The registrable domain, not the console host, so passkeys survive a move to another subdomain. */
export function passkeyRpId(env: AuthEnv): string {
  const { hostname } = new URL(env.BETTER_AUTH_URL)

  if (LOOPBACK_HOSTS.has(hostname) || IPV4_HOST_RE.test(hostname)) {
    return hostname
  }

  const labels = hostname.split(".")

  return labels.length > 2 ? labels.slice(-2).join(".") : hostname
}
