export const PUBLISH_TOKEN_PREFIX = "pupitre_pub_"

export const PUBLISH_TOKEN_VARIABLE = "PUPITRE_PUBLISH_TOKEN"

/** A second accepted token lets a rotation leave no window. */
export const PREVIOUS_PUBLISH_TOKEN_VARIABLE = "PUPITRE_PUBLISH_TOKEN_PREVIOUS"

export type PublishTokenEnv = Record<string, string | undefined>

export function isPublishToken(value: string): boolean {
  return value.startsWith(PUBLISH_TOKEN_PREFIX)
}

export function acceptedPublishTokens(
  env: PublishTokenEnv = process.env
): string[] {
  return [env[PUBLISH_TOKEN_VARIABLE], env[PREVIOUS_PUBLISH_TOKEN_VARIABLE]]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )

  return new Uint8Array(bytes)
}

// Comparing digests defeats timing attacks: a caller cannot choose what its token hashes to.
function sameDigest(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }

  let differences = 0

  for (let index = 0; index < left.length; index += 1) {
    differences += Math.abs((left[index] ?? 0) - (right[index] ?? 0))
  }

  return differences === 0
}

export async function verifyPublishToken(
  token: string,
  env: PublishTokenEnv = process.env
): Promise<boolean> {
  const accepted = acceptedPublishTokens(env)

  if (accepted.length === 0) {
    return false
  }

  const presented = await digest(token)
  const digests = await Promise.all(accepted.map(digest))

  return digests.reduce(
    (matched, candidate) => sameDigest(presented, candidate) || matched,
    false
  )
}
