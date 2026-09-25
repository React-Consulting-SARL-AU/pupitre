import type { AgentError } from "@shared/agent";
import type { KeyChoice } from "@shared/servers";

export type RefusedField = "password" | "keyFile";

const KEY_FILE_REFUSALS = new Set([
  "refusal.key.missing",
  "refusal.key.public",
  "refusal.key.unreadable",
]);

/** The field on screen a refusal of the addition is about; none, and it is said at the foot of the form. */
export function refusedField(
  error: AgentError | null,
  mode: KeyChoice["mode"],
  asksPassword: boolean
): RefusedField | null {
  const id = error?.phrase?.id;

  if (id === "refusal.setup.password") {
    return asksPassword ? "password" : null;
  }

  return mode === "import" && id && KEY_FILE_REFUSALS.has(id)
    ? "keyFile"
    : null;
}
