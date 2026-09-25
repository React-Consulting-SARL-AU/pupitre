import type { Session } from "@pupitre/shared/agent-protocol/state";
import type { Terminal } from "@shared/terminals";

// `agent.open` reattaches to this pair; a shell dies with its tab and is never counted.
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
