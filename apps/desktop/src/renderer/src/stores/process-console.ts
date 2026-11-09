import type { AgentError } from "@shared/agent";
import type { TerminalSize } from "@shared/terminals";
import { create } from "zustand";
import {
  proposeSize,
  resetScreen,
  scrollbackLines,
  writeLocal,
} from "../lib/terminals";

export type ConsoleState =
  | { status: "opening" }
  | { status: "live" }
  /** No window to watch, or an agent that cannot show one: the journal on disk stands in. */
  | { status: "journal"; why: AgentError }
  | { status: "failed"; error: AgentError };

export interface ConsoleTarget {
  id: string;
  serverId: string;
  project: string;
  process: string;
}

/** The disk journal is all there is to show for these refusals; any other one is a failure to say. */
const JOURNAL_INSTEAD: readonly AgentError["code"][] = [
  "project_not_found",
  "unknown_command",
];

const JOURNAL_TAIL = 400;

/** A restart closes the window then opens the next: attached in between, the view would find nothing. */
export const REATTACH_MS = 700;

const CLASSIC: TerminalSize = { cols: 80, rows: 24 };

interface ProcessConsoleStore {
  consoles: Record<string, ConsoleState>;
  open: (target: ConsoleTarget) => Promise<void>;
  /** The view's session ended with its window: the process stopped, or restarted under a new one. */
  ended: (target: ConsoleTarget) => void;
  close: (id: string) => void;
}

const follows = new Map<string, () => void>();
const generations = new Map<string, number>();
const retries = new Map<string, ReturnType<typeof setTimeout>>();

function letGo(id: string): void {
  follows.get(id)?.();
  follows.delete(id);
  clearTimeout(retries.get(id));
  retries.delete(id);
}

function nextGeneration(id: string): number {
  const generation = (generations.get(id) ?? 0) + 1;

  generations.set(id, generation);

  return generation;
}

export const useProcessConsole = create<ProcessConsoleStore>((set, get) => {
  function settle(id: string, generation: number, state: ConsoleState): void {
    if (generations.get(id) === generation) {
      set((current) => ({ consoles: { ...current.consoles, [id]: state } }));
    }
  }

  function followJournal(
    target: ConsoleTarget,
    generation: number,
    why: AgentError
  ): void {
    const { id, serverId, project, process } = target;

    resetScreen(id);

    // A journal line keeps the pane's own carriage return, but Pupitre's start and stop marks have none.
    const follow = window.pupitre.followProjectJournal(
      serverId,
      project,
      process,
      JOURNAL_TAIL,
      (line) => {
        if (generations.get(id) === generation) {
          writeLocal(id, `${line}\r\n`);
        }
      }
    );

    follows.set(id, follow.cancel);
    settle(id, generation, { status: "journal", why });

    follow.done.then((answer) => {
      if (!answer.ok) {
        settle(id, generation, { error: answer.error, status: "failed" });
      }
    });
  }

  return {
    consoles: {},

    async open(target) {
      const { id, serverId, project, process } = target;
      const generation = nextGeneration(id);

      letGo(id);
      settle(id, generation, { status: "opening" });

      const size = proposeSize(id) ?? CLASSIC;
      const answer = await window.pupitre.openProcessConsole(
        id,
        serverId,
        project,
        process,
        size.cols,
        size.rows,
        scrollbackLines()
      );

      if (generations.get(id) !== generation) {
        return;
      }

      if (answer.ok) {
        settle(id, generation, { status: "live" });
      } else if (JOURNAL_INSTEAD.includes(answer.error.code)) {
        followJournal(target, generation, answer.error);
      } else {
        settle(id, generation, { error: answer.error, status: "failed" });
      }
    },

    ended(target) {
      if (get().consoles[target.id]?.status !== "live") {
        return;
      }

      clearTimeout(retries.get(target.id));
      retries.set(
        target.id,
        setTimeout(() => get().open(target), REATTACH_MS)
      );
    },

    close(id) {
      letGo(id);
      nextGeneration(id);
      set((current) => {
        const { [id]: _gone, ...rest } = current.consoles;

        return { consoles: rest };
      });
    },
  };
});
