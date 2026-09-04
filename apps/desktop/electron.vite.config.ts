import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";
import { embedAgent } from "./scripts/embed-agent";

const AGENT_PROBE = resolve("../agent/internal/probe/probe.sh");
const EMBEDDED_PROBE = resolve("resources/probe.sh");
const AGENT_DIST = resolve("../agent/dist");
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

export default defineConfig({
  main: {
    // The design tokens ship as TypeScript: Electron cannot require them at
    // runtime, so they are bundled in rather than externalised.
    plugins: [
      embedProbeScript(),
      embedAgentBinary(),
      externalizeDepsPlugin({
        exclude: ["@pupitre/auth", "@pupitre/design", "@pupitre/shared"],
      }),
    ],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
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
