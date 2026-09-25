import { isEntryName } from "@renderer/lib/files";
import type { AgentError } from "@shared/agent";
import { agentLine } from "./agent-error";
import type { Translate } from "./i18n";

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
