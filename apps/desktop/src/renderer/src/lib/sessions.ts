import type { Session } from "@pupitre/shared/agent-protocol/state";
import type { Terminal } from "@shared/terminals";

/**
 * Which background sessions the app still has a tab on.
 *
 * An agent runs in a session of the server, and closing its tab only detaches
 * from it: that is what makes an agent survive a restart of the app, and what
 * makes a machine end up carrying agents nobody is talking to. The rest — the
 * ones with no tab — are the sessions left lying around.
 *
 * A session is named by its kind and its project, and the agent opens at most
 * one per pair: `agent.open` reattaches rather than starting a second. Shells
 * are not in the count — the app opens those itself, and closing the tab ends
 * them.
 */

function key(kind: string, project: string): string {
  return `${kind}:${project}`;
}

export function attachedSessions(
  terminals: readonly Terminal[]
): readonly string[] {
  const keys: string[] = [];

  for (const terminal of terminals) {
    if (terminal.kind !== "shell" && terminal.project) {
      const found = key(terminal.kind, terminal.project);

      if (!keys.includes(found)) {
        keys.push(found);
      }
    }
  }

  return keys;
}

export function isAttached(
  attached: readonly string[],
  session: Session
): boolean {
  return (
    session.kind !== "shell" &&
    session.kind !== "ide" &&
    session.project !== undefined &&
    attached.includes(key(session.kind, session.project))
  );
}
