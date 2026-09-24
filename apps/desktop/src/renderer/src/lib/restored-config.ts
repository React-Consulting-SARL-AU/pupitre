import type {
  ModuleConfig,
  ModuleConfigResult,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { agentCall } from "./agent-call";

/**
 * What a restored machine holds for each module, read back from it.
 *
 * `backup.restore.setup` put the backup's configuration in place; the install
 * that follows names the same values again, and leaves out every secret the
 * machine already holds — a secret absent from the line is kept, which is what
 * makes a restore ask nothing twice.
 */
export interface RestoredConfig {
  values: ModuleConfig;
  /** The secrets each module already holds on the machine, by field. */
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
