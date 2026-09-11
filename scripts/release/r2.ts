import { readFileSync, writeFileSync } from "node:fs"
import { S3Client } from "bun"
import { say } from "./cli"

/**
 * The buckets are the one place every step meets: what a step produces goes
 * up under the version's folder, what the next step needs comes down from
 * there. A runner that holds the bucket's key can take any step over from
 * any machine, and nothing depends on where the previous one ran.
 *
 * They are reached over S3, with a key that opens the two buckets and nothing
 * else on the account — the Cloudflare API would want a token over every
 * bucket the account has. `put` is idempotent: the same key written twice
 * holds the same bytes, so a step run again after a failure rewrites what it
 * had written.
 *
 * Objects pass through memory rather than being streamed to and from disk:
 * Bun's streaming to a file crashes on Windows, and nothing here is larger
 * than an installer.
 */

export const R2_VARIABLES = {
  accountId: "R2_ACCOUNT_ID",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
} as const

export interface Bucket {
  name: string
  dryRun: boolean
  client: S3Client | null
}

export function bucket(
  name: string,
  env: NodeJS.ProcessEnv,
  dryRun: boolean
): Bucket {
  const accountId = env[R2_VARIABLES.accountId]
  const accessKeyId = env[R2_VARIABLES.accessKeyId]
  const secretAccessKey = env[R2_VARIABLES.secretAccessKey]

  if (!(accountId && accessKeyId && secretAccessKey)) {
    if (dryRun) {
      return { client: null, dryRun, name }
    }

    throw new Error(
      `${Object.values(R2_VARIABLES).join(", ")} are needed to reach ${name}.`
    )
  }

  return {
    client: new S3Client({
      accessKeyId,
      bucket: name,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      secretAccessKey,
    }),
    dryRun,
    name,
  }
}

export async function put(
  bucket: Bucket,
  key: string,
  file: string
): Promise<void> {
  say(`r2 put ${bucket.name}/${key} <- ${file}`)

  if (bucket.dryRun || !bucket.client) {
    return
  }

  await bucket.client.write(key, readFileSync(file))
}

export async function get(
  bucket: Bucket,
  key: string,
  file: string
): Promise<void> {
  say(`r2 get ${bucket.name}/${key} -> ${file}`)

  if (bucket.dryRun || !bucket.client) {
    return
  }

  const object = bucket.client.file(key)

  if (!(await object.exists())) {
    throw new Error(`${bucket.name}/${key} does not exist.`)
  }

  writeFileSync(file, Buffer.from(await object.arrayBuffer()))
}

/** The folder of a version in the private bucket, one subfolder per producer. */
export const keys = {
  agent: (version: string, file: string) => `agent/${version}/${file}`,
  appDeclarations: (version: string) => `app/${version}/publications.json`,
  /** Where a desktop build leaves its artefacts for the publish step, per system. */
  work: (version: string, os: string, file: string) =>
    `work/${version}/${os}/${file}`,
}
