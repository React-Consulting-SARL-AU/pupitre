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
  "ai.cursor": "cursor",
  "ai.gemini": "gemini",
  "ai.copilot": "copilot",
  "ai.opencode": "opencode",
  "ai.hermes": "hermes",
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

/** An agent and the module that put it on the machine, as the snapshot names it. */
export interface AgentModule {
  agent: TerminalAgent;
  moduleId: string;
  name: string;
  version: string | null;
}

export function agentModulesFrom(services: readonly Service[]): AgentModule[] {
  const modules: AgentModule[] = [];

  for (const service of services) {
    const agent = AGENT_MODULES[service.id];

    if (agent && !modules.some((held) => held.agent === agent)) {
      modules.push({
        agent,
        moduleId: service.id,
        name: service.name,
        version: service.version ?? null,
      });
    }
  }

  return modules;
}

export function agentsFrom(services: readonly Service[]): TerminalAgent[] {
  return agentModulesFrom(services).map((held) => held.agent);
}

export function remoteEditors(services: readonly Service[]): RemoteEditor[] {
  return editorsFor(services);
}
