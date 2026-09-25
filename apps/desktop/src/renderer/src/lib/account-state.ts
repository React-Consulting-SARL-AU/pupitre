import type { Login, LoginState } from "@pupitre/shared/agent-protocol/state";
import type { ConnectionState } from "@shared/connections";

export function accountStateOf(
  login: Login | undefined,
  held: ConnectionState | null
): LoginState | null {
  if (login) {
    return login.state;
  }

  if (!held) {
    return null;
  }

  return held.status === "connected" ? "signed_in" : "signed_out";
}
