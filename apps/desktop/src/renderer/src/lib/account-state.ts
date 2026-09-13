import type { Login, LoginState } from "@pupitre/shared/agent-protocol/state";
import type { ConnectionState } from "@shared/connections";

/**
 * Whether a module works as somebody, from the two answers the app can have.
 *
 * The agent's, when the module's CLI signs in to an account, is the one shown
 * as it came. Otherwise the app's own: a module that declares a connection is
 * connected when this computer holds the account, and nothing more is known
 * of it. A module with neither has nothing to say, and the screen says
 * nothing.
 */
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
