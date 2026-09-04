import type {
  PackageManager,
  Service,
} from "@pupitre/shared/agent-protocol/state";
import { editorsFor, type RemoteEditor } from "@shared/editors";
import type { TerminalAgent } from "@shared/terminals";

/**
 * What the machine offers, read off the modules the agent installed.
 *
 * The app holds no list of what a server can do: `snapshot.services` names the
 * modules that are actually there, and a button exists only when its module
 * does. A machine without `ai.claude` shows no Claude tab, and one without an
 * editor module shows no editor.
 */

const AGENT_MODULES: Record<string, TerminalAgent> = {
  "ai.claude": "claude",
  "ai.codex": "codex",
};

/**
 * Only the package managers whose runtime a catalogue module actually names.
 * Lending Bun the Node mark would name the wrong product, so it gets none.
 */
const RUNTIME_MODULES: Partial<Record<PackageManager, string>> = {
  gradle: "runtime.java",
  npm: "runtime.node",
  pnpm: "runtime.node",
  uv: "runtime.python",
};

export function runtimeModuleOf(pkgmgr: PackageManager): string | null {
  return RUNTIME_MODULES[pkgmgr] ?? null;
}

export function installedModules(services: readonly Service[]): string[] {
  return services.map((service) => service.id);
}

export function agentsFrom(services: readonly Service[]): TerminalAgent[] {
  const agents: TerminalAgent[] = [];

  for (const service of services) {
    const agent = AGENT_MODULES[service.id];

    if (agent && !agents.includes(agent)) {
      agents.push(agent);
    }
  }

  return agents;
}

export function remoteEditors(services: readonly Service[]): RemoteEditor[] {
  return editorsFor(installedModules(services));
}
