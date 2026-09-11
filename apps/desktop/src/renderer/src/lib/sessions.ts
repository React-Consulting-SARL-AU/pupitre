import type { Session } from "@pupitre/shared/agent-protocol/state";
import type { Terminal } from "@shared/terminals";

// A session is named by kind and project: `agent.open` reattaches to that pair
// rather than opening a second. A shell dies with its tab and is not counted.

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

/** An agent session with a project and no tab: one a tab can be opened on again. */
export function reattachable(
  attached: readonly string[],
  session: Session
): boolean {
  return (
    session.kind !== "shell" &&
    session.kind !== "ide" &&
    session.project !== undefined &&
    session.project !== "" &&
    !isAttached(attached, session)
  );
}
