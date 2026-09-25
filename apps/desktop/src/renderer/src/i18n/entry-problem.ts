import { isEntryName } from "@renderer/lib/files";
import type { AgentError } from "@shared/agent";
import { agentLine } from "./agent-error";
import type { Translate } from "./i18n";

/** Why a file or folder name will not do: the rule the app knows, then what the agent said. */
export function entryProblem(
  t: Translate,
  typed: string,
  refusal: AgentError | null
): string | undefined {
  if (typed.length > 0 && !isEntryName(typed)) {
    return t("files.name.problem");
  }

  return refusal ? agentLine(t, refusal) : undefined;
}
