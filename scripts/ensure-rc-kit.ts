import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const HTTPS_REPOSITORY =
  "https://github.com/React-Consulting-SARL-AU/rc-kit.git"
const SSH_REPOSITORY = "git@github.com:React-Consulting-SARL-AU/rc-kit.git"
const KIT_TOKEN_VARIABLE = "RC_KIT_TOKEN"
const RELINK_GUARD = "RC_KIT_RELINK"
const INFISICAL_TOKEN_FILE = join(ROOT, ".infisical-token")
const LINKED_KIT = join(ROOT, "node_modules", "@rc", "kit", "package.json")
const CLONED_MARKER = join(
  tmpdir(),
  `rc-kit-${createHash("sha1").update(ROOT).digest("hex").slice(0, 12)}.cloned`
)

function say(message: string): void {
  console.log(`rc-kit : ${message}`)
}

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? parseJson<T>(readFileSync(path, "utf8")) : undefined
}

function kitDirectory(): string | undefined {
  const manifest = readJson<{ devDependencies?: Record<string, string> }>(
    join(ROOT, "package.json")
  )
  const spec = manifest?.devDependencies?.["@rc/kit"]

  return spec?.startsWith("link:") ? resolve(ROOT, spec.slice(5)) : undefined
}

function gitClone(
  repository: string,
  directory: string,
  env: Record<string, string> = {}
): boolean {
  const result = spawnSync("git", ["clone", "--quiet", repository, directory], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    stdio: "ignore",
    timeout: 120_000,
  })

  return result.status === 0
}

function authorizationHeader(token: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64")

  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  }
}

function tokenFromInfisical(): string | undefined {
  const config = readJson<{ infisical?: { projectId?: string } }>(
    join(ROOT, "rc.config.json")
  )
  const projectId = config?.infisical?.projectId

  if (!projectId) {
    return undefined
  }

  const env: Record<string, string | undefined> = { ...process.env }

  if (existsSync(INFISICAL_TOKEN_FILE)) {
    env.INFISICAL_TOKEN = readFileSync(INFISICAL_TOKEN_FILE, "utf8").trim()
  }

  const result = spawnSync(
    "infisical",
    [
      "export",
      "--projectId",
      projectId,
      "--env",
      "dev",
      "--format",
      "json",
      "--silent",
    ],
    { env, input: "", encoding: "utf8", timeout: 60_000 }
  )

  if (result.status !== 0) {
    return undefined
  }

  const rows = parseJson<{ key?: string; value?: string }[]>(result.stdout)

  return rows?.find((row) => row.key === KIT_TOKEN_VARIABLE)?.value || undefined
}

function cloneKit(directory: string): boolean {
  say(`${relative(ROOT, directory)} est absent, clonage…`)

  if (gitClone(HTTPS_REPOSITORY, directory)) {
    say("cloné avec ton accès GitHub.")
    return true
  }

  if (
    gitClone(SSH_REPOSITORY, directory, {
      GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
    })
  ) {
    say("cloné avec ta clé SSH GitHub.")
    return true
  }

  const token = process.env[KIT_TOKEN_VARIABLE] || tokenFromInfisical()

  if (!token) {
    say(
      `pas d'accès GitHub à rc-kit et pas de ${KIT_TOKEN_VARIABLE} (variable d'environnement, ou environnement dev du projet Infisical). Clone-le à la main : git clone ${HTTPS_REPOSITORY} ${relative(ROOT, directory)}`
    )
    return false
  }

  if (gitClone(HTTPS_REPOSITORY, directory, authorizationHeader(token))) {
    say(`cloné avec ${KIT_TOKEN_VARIABLE}.`)
    return true
  }

  say(
    `le clonage avec ${KIT_TOKEN_VARIABLE} a échoué : jeton expiré ou sans accès en lecture à rc-kit.`
  )
  return false
}

function ensureCloned(): void {
  const directory = kitDirectory()

  if (
    process.env[RELINK_GUARD] ||
    !directory ||
    existsSync(join(directory, "package.json"))
  ) {
    return
  }

  if (cloneKit(directory)) {
    writeFileSync(CLONED_MARKER, ROOT)
  }
}

function relinkAfterClone(): void {
  if (process.env[RELINK_GUARD] || !existsSync(CLONED_MARKER)) {
    return
  }

  rmSync(CLONED_MARKER, { force: true })

  if (existsSync(LINKED_KIT)) {
    return
  }

  say("liaison de node_modules/@rc/kit…")
  spawnSync(process.execPath, ["install"], {
    stdio: "inherit",
    env: { ...process.env, [RELINK_GUARD]: "1" },
  })
  say(
    "rc-kit est cloné et lié. Bun peut signaler « Failed to install 1 package » pour cette première installation : relance `bun install` pour un code de sortie propre."
  )
}

if (process.argv[2] === "link") {
  relinkAfterClone()
} else {
  ensureCloned()
}
