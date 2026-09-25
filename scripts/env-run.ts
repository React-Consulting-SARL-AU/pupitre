import { spawnSync } from "node:child_process"
import {
  commandOf,
  environmentOf,
  fieldsToEnv,
  readEnvironments,
} from "./environments"

function main(args: readonly string[]): number {
  const { argv, name } = commandOf(args)
  const config = readEnvironments()
  const environment = environmentOf(name, config)
  const note = spawnSync(
    "op",
    [
      "item",
      "get",
      environment.item,
      "--vault",
      config.vault,
      "--format",
      "json",
    ],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] }
  )

  if (note.status !== 0) {
    throw new Error(
      `the note ${environment.item} could not be read: sign in with \`op signin\`.`
    )
  }

  const values = fieldsToEnv(JSON.parse(note.stdout))

  const database = environment.database
    ? `, database ${environment.database}`
    : ""

  process.stderr.write(
    `${name}: ${Object.keys(values).length} variables from ${environment.item}${database}\n`
  )

  const result = spawnSync(argv[0] as string, argv.slice(1), {
    env: { ...process.env, ...values },
    stdio: "inherit",
  })

  if (result.error) {
    throw result.error
  }

  return result.status ?? 1
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)))
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exit(1)
  }
}
