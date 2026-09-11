import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";
import { embedAgent } from "./scripts/embed-agent";

const ROOT_ENV = resolve("../../.env.local");
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/;
const QUOTED = /^"(.*)"$/;

/**
 * The monorepo's local environment, handed to the Electron process.
 *
 * `bun run` loads `.env.local` for itself and passes none of it to the script
 * it runs, and turbo hashes the file without exporting it: a variable written
 * there for the desktop — the platform to talk to, the machine a development
 * build fills in — never reached the main process. It is read here, once, in
 * the process that spawns Electron, and only where the shell said nothing.
 */
function loadRootEnv(): void {
  if (!existsSync(ROOT_ENV)) {
    return;
  }

  for (const raw of readFileSync(ROOT_ENV, "utf8").split("\n")) {
    const line = raw.trim();
    const at = line.indexOf("=");

    if (line.startsWith("#") || at <= 0) {
      continue;
    }

    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();

    if (!(key in process.env) && ENV_KEY.test(key)) {
      process.env[key] = value.replace(QUOTED, "$1");
    }
  }
}

loadRootEnv();

const AGENT_PROBE = resolve("../agent/internal/probe/probe.sh");
const EMBEDDED_PROBE = resolve("resources/probe.sh");
/**
 * Where the embedded agent comes from.
 *
 * In development, the workspace `dist/` that `@pupitre/agent#build` fills;
 * turbo runs that build before `dev` and `build` here, so the agent pushed on a
 * server is the one the sources describe. In a release, `PUPITRE_AGENT_DIST`
 * points at `dist/release/`, so the app embeds exactly the signed binaries the
 * publishing chain produced rather than one more local build.
 */
const AGENT_DIST = resolve(process.env.PUPITRE_AGENT_DIST ?? "../agent/dist");
const EMBEDDED_AGENT = resolve("resources/agent");

/**
 * The probe the app sends is the agent's own file, copied at build time.
 *
 * A second copy maintained by hand would drift the day the agent's probe learns
 * something new, and the app would go on describing machines with last year's
 * questions.
 */
function embedProbeScript(): Plugin {
  return {
    name: "pupitre-embed-probe",
    buildStart() {
      mkdirSync(dirname(EMBEDDED_PROBE), { recursive: true });
      copyFileSync(AGENT_PROBE, EMBEDDED_PROBE);
    },
  };
}

/**
 * The agent the app will push onto a bare server, copied from its own build.
 *
 * A missing build is said out loud and does not stop the app from being built:
 * a developer working on a screen has no reason to need Go, and the install
 * screen tells the reader plainly when there is no binary to send.
 */
function embedAgentBinary(): Plugin {
  return {
    name: "pupitre-embed-agent",
    buildStart() {
      const { missing } = embedAgent({ from: AGENT_DIST, to: EMBEDDED_AGENT });

      if (missing.length > 0) {
        this.warn(
          `agent absent pour ${missing.join(", ")} : bun --cwd=apps/agent run build`
        );
      }
    },
  };
}

/**
 * CommonJS for the main process and the preload.
 *
 * V8 produces no cache data for an ES module, so bytecode below needs this
 * format; the workspace stays `"type": "module"`, which makes the two entries
 * come out as `.cjs`, and everything that points at them says so.
 */
const NODE_SIDE = {
  rollupOptions: { output: { format: "cjs" } },
} as const;

/**
 * The main process ships as V8 bytecode: no readable code in the archive.
 *
 * The preload does not, and cannot for now: Electron loads it in the renderer,
 * whose V8 refuses cache data produced by the Node isolate that compiled it
 * (`cachedDataRejected`), and the window then opens without its bridge. It is
 * no loss worth chasing — the preload declares channel names and nothing else,
 * exactly like the renderer beside it.
 */
const PROTECTED = {
  ...NODE_SIDE,
  bytecode: { protectedStrings: [] as string[] },
} as const;

/**
 * The version the app says it is: the one electron-builder stamps the bundle
 * with. `app.getVersion()` reads the same field once packaged, but answers
 * Electron's own version from a development folder, which is not this app's.
 */
const APP_VERSION = (
  JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
    version: string;
  }
).version;

export default defineConfig({
  main: {
    define: {
      "import.meta.env.MAIN_VITE_APP_VERSION": JSON.stringify(APP_VERSION),
    },
    // The design tokens ship as TypeScript: Electron cannot require them at
    // runtime, so they are bundled in rather than externalised.
    plugins: [
      embedProbeScript(),
      embedAgentBinary(),
      externalizeDepsPlugin({
        exclude: ["@pupitre/auth", "@pupitre/design", "@pupitre/shared"],
      }),
    ],
    build: PROTECTED,
    // The release bucket is named once, by the variable the publishing script
    // already reads; the full name is the prefix, so nothing else of the
    // environment ends up in the bundle.
    envPrefix: ["MAIN_VITE_", "VITE_", "PUPITRE_DOWNLOADS_URL"],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: NODE_SIDE,
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
  },
});
