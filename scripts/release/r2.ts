import { readFileSync, writeFileSync } from "node:fs"
import { S3Client } from "bun"
import { say } from "./cli"

// Objects pass through memory: Bun's streaming to a file crashes on Windows.
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

export const keys = {
  agent: (version: string, file: string) => `agent/${version}/${file}`,
  appDeclarations: (version: string) => `app/${version}/publications.json`,
  work: (version: string, os: string, file: string) =>
    `work/${version}/${os}/${file}`,
}
