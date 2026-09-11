import type { AgentError } from "@shared/agent";
import type { TerminalKind } from "@shared/terminals";
import { create } from "zustand";

export type SessionState =
  | { status: "opening" }
  | { status: "open"; session: string | null }
  | { status: "ended"; session: string | null; code: number }
  | { status: "failed"; error: AgentError };

/** A sign-in a session is waiting on: its host, and whether the browser already has it. */
export interface LoginLink {
  host: string;
  opened: boolean;
}

interface TerminalsStore {
  sessions: Record<string, SessionState>;
  /** The sign-in each session is waiting on, by session; the address itself never comes. */
  links: Record<string, LoginLink>;
  /** The session whose search bar is open. */
  search: string | null;

  /**
   * Answers with the session the machine named, so the tab can be found again.
   * `size` is what the host measured before opening; without it the PTY opens
   * at the classic 80×24 and is resized a frame later.
   */
  start: (
    id: string,
    serverId: string,
    kind: TerminalKind,
    project: string | null,
    session: string | null,
    dir?: string | null,
    size?: TerminalSize | null
  ) => Promise<string | null>;
  /** The same tab, a fresh process: what the reader asks for when one has ended. */
  restart: (
    id: string,
    serverId: string,
    kind: TerminalKind,
    project: string | null,
    session: string | null,
    dir?: string | null,
    size?: TerminalSize | null
  ) => Promise<string | null>;
  noteExit: (id: string, code: number) => void;
  noteLink: (id: string, host: string) => void;
  /** Opens the sign-in in the reader's browser; the address stays in the main process. */
  openLogin: (id: string) => Promise<void>;
  dismissLogin: (id: string) => void;
  openSearch: (id: string) => void;
  closeSearch: () => void;
  forget: (id: string) => void;
  reset: () => void;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

const CLASSIC: TerminalSize = { cols: 80, rows: 24 };

function without<T>(held: Record<string, T>, id: string): Record<string, T> {
  const { [id]: _gone, ...rest } = held;

  return rest;
}

export const useTerminals = create<TerminalsStore>((set, get) => ({
  links: {},
  search: null,
  sessions: {},

  // A tab that mounts twice must not start two sessions on the machine.
  async start(id, serverId, kind, project, session, dir = null, size = null) {
    if (get().sessions[id]) {
      return null;
    }

    set((state) => ({
      sessions: { ...state.sessions, [id]: { status: "opening" } },
    }));

    const opened = size ?? CLASSIC;
    const answer = await window.pupitre.openTerminal(
      id,
      serverId,
      kind,
      project,
      session,
      opened.cols,
      opened.rows,
      dir
    );

    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: answer.ok
          ? { session: answer.result.session, status: "open" }
          : { error: answer.error, status: "failed" },
      },
    }));

    return answer.ok ? answer.result.session : null;
  },

  restart(id, serverId, kind, project, session, dir = null, size = null) {
    get().forget(id);

    return get().start(id, serverId, kind, project, session, dir, size);
  },

  /** The process is gone; the tab stays, with what it printed and the way out. */
  noteExit(id, code) {
    const current = get().sessions[id];

    if (current?.status !== "open") {
      return;
    }

    set((state) => ({
      links: without(state.links, id),
      sessions: {
        ...state.sessions,
        [id]: { code, session: current.session, status: "ended" },
      },
    }));
  },

  /** A fresh address, even on a host already shown: the browser has not seen this one. */
  noteLink(id, host) {
    set((state) => ({
      links: { ...state.links, [id]: { host, opened: false } },
    }));
  },

  async openLogin(id) {
    const opened = await window.pupitre.openLogin(id);
    const link = get().links[id];

    if (opened && link) {
      set((state) => ({
        links: { ...state.links, [id]: { ...link, opened: true } },
      }));
    }
  },

  dismissLogin(id) {
    window.pupitre.dismissLogin(id);
    set((state) => ({ links: without(state.links, id) }));
  },

  openSearch(id) {
    set({ search: id });
  },

  closeSearch() {
    set({ search: null });
  },

  forget(id) {
    set((state) => ({
      links: without(state.links, id),
      search: state.search === id ? null : state.search,
      sessions: without(state.sessions, id),
    }));
  },

  reset() {
    set({ links: {}, search: null, sessions: {} });
  },
}));
