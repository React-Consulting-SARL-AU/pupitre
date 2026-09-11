import { run } from "./shell"

/**
 * The buckets are the one place every step meets: what a step produces goes
 * up under the version's folder, what the next step needs comes down from
 * there. A runner that holds the bucket's token can take any step over from
 * any machine, and nothing depends on where the previous one ran.
 *
 * `put` is idempotent — the same key written twice holds the same bytes — so a
 * step that is run again after a failure rewrites what it had written.
 */

export interface Bucket {
  name: string
  dryRun: boolean
}

function wrangler(argv: string[], bucket: Bucket): void {
  run(["bun", "x", "wrangler", "r2", "object", ...argv, "--remote"], {
    dryRun: bucket.dryRun,
  })
}

export function put(bucket: Bucket, key: string, file: string): void {
  wrangler(["put", `${bucket.name}/${key}`, `--file=${file}`], bucket)
}

export function get(bucket: Bucket, key: string, file: string): void {
  wrangler(["get", `${bucket.name}/${key}`, `--file=${file}`], bucket)
}

/** The folder of a version in the private bucket, one subfolder per producer. */
export const keys = {
  agent: (version: string, file: string) => `agent/${version}/${file}`,
  appDeclarations: (version: string) => `app/${version}/publications.json`,
  /** Where a desktop build leaves its artefacts for the publish step, per system. */
  work: (version: string, os: string, file: string) =>
    `work/${version}/${os}/${file}`,
}
