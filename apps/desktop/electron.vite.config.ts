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

/** `bun run` and turbo never hand `.env.local` to the child, so it is read here, below what the shell set. */
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

/** A release points `PUPITRE_AGENT_DIST` at `dist/release/` to embed the signed binaries, not a local build. */
const AGENT_DIST = resolve(process.env.PUPITRE_AGENT_DIST ?? "../agent/dist");
const EMBEDDED_AGENT = resolve("resources/agent");

/** Copied from the agent at build time: a hand-kept copy would drift from the agent's probe. */
function embedProbeScript(): Plugin {
  return {
    name: "pupitre-embed-probe",
    buildStart() {
      mkdirSync(dirname(EMBEDDED_PROBE), { recursive: true });
      copyFileSync(AGENT_PROBE, EMBEDDED_PROBE);
    },
  };
}

/** A missing agent build only warns: working on a screen should not require Go. */
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

/** V8 produces no cache data for an ES module, so bytecode needs CommonJS; the entries come out as `.cjs`. */
const NODE_SIDE = {
  rollupOptions: { output: { format: "cjs" } },
} as const;

/** Main only: the renderer's V8 rejects the preload's bytecode (`cachedDataRejected`) and the bridge is lost. */
const PROTECTED = {
  ...NODE_SIDE,
  bytecode: { protectedStrings: [] as string[] },
} as const;

/** `app.getVersion()` answers Electron's own version when unpackaged. */
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
    // Only `dependencies` ship outside the bundle; anything else the main imports must be a devDependency.
    plugins: [embedProbeScript(), embedAgentBinary(), externalizeDepsPlugin()],
    build: PROTECTED,
    // The full variable name as a prefix, so nothing else of the environment ends up in the bundle.
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
