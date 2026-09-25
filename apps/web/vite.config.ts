import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { createLogger, defineConfig, type Plugin } from "vite"

const ROOT = path.dirname(fileURLToPath(import.meta.url))

// Vite answers 403 to any host it was not told about, the dev tunnel included.
const TUNNEL_HOST =
  process.env.PUPITRE_TUNNEL_HOSTNAME ??
  new URL(PUPITRE_ORIGINS.devTunnel).hostname

const MAX_CAUSE_DEPTH = 5

function describe(error: Error): string {
  const { code } = error as NodeJS.ErrnoException

  return code ? `${code} — ${error.message}` : error.message
}

// Undici only says `fetch failed`; the real socket error lives in the `cause` chain Vite does not print.
function causes(error: unknown): string[] {
  const found: string[] = []
  let current = error instanceof Error ? error.cause : undefined

  while (current instanceof Error && found.length < MAX_CAUSE_DEPTH) {
    found.push(describe(current))

    if (current instanceof AggregateError) {
      for (const nested of current.errors) {
        if (nested instanceof Error) {
          found.push(`  ${describe(nested)}`)
        }
      }
    }

    current = current.cause
  }

  return found
}

function loggerWithCauses() {
  const logger = createLogger()
  const write = logger.error.bind(logger)

  logger.error = (message, options) => {
    const chain = causes(options?.error)

    write(
      chain.length === 0
        ? message
        : `${message}\n  cause: ${chain.join("\n  ")}`,
      options
    )
  }

  return logger
}

const LOOPBACK_MIRRORS: Record<string, string> = {
  "127.0.0.1": "::1",
  "::1": "127.0.0.1",
}

// macOS may resolve `localhost` to either loopback: a mirror listener serves the other one.
function dualLoopback(): Plugin {
  return {
    name: "pupitre:dual-loopback",
    configureServer(server) {
      const primary = server.httpServer

      if (!primary) {
        return
      }

      primary.once("listening", () => {
        const address = primary.address()

        if (address === null || typeof address === "string") {
          return
        }

        const mirrorHost = LOOPBACK_MIRRORS[address.address]

        if (!mirrorHost) {
          return
        }

        const mirror = http.createServer()

        mirror.on("request", (req, res) => {
          primary.emit("request", req, res)
        })
        mirror.on("upgrade", (req, socket, head) => {
          primary.emit("upgrade", req, socket, head)
        })
        mirror.on("error", (error) => {
          server.config.logger.warn(
            `[pupitre] écoute sur ${mirrorHost}:${address.port} impossible : ${error.message}`
          )
        })

        mirror.listen(address.port, mirrorHost)

        primary.once("close", () => {
          mirror.closeAllConnections()
          mirror.close()
        })
      })
    },
  }
}

export default defineConfig({
  envDir: path.resolve(ROOT, "../.."),
  envPrefix: "VITE_",
  plugins: [
    cloudflare({
      configPath: "wrangler.jsonc",
      inspectorPort: false,
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart(),
    react(),
    tailwindcss(),
    dualLoopback(),
  ],
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(ROOT, "src") }],
  },
  customLogger: loggerWithCauses(),
  server: {
    allowedHosts: ["localhost", TUNNEL_HOST],
  },
})
