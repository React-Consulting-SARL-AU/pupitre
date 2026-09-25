import type {
  ModuleConfig,
  ModuleConfigResult,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { agentCall } from "./agent-call";

export interface RestoredConfig {
  values: ModuleConfig;
  /** Secrets the machine already holds; the install leaves them out, and the agent keeps them. */
  held: Record<string, readonly string[]>;
}

export async function restoredConfig(
  serverId: string,
  modules: readonly string[]
): Promise<AgentResponse<RestoredConfig>> {
  const answers = await Promise.all(
    modules.map((id) =>
      agentCall<ModuleConfigResult>(serverId, "module.config", { id })
    )
  );

  const values: ModuleConfig = {};
  const held: Record<string, readonly string[]> = {};

  for (const [index, answer] of answers.entries()) {
    const id = modules[index] as string;

    if (!answer.ok) {
      return answer;
    }

    values[id] = answer.result.values;
    held[id] = answer.result.secrets;
  }

  return { ok: true, result: { held, values } };
}
