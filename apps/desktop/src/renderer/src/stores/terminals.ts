import type { AgentError } from "@shared/agent";
import type { TerminalKind, ViewBounds } from "@shared/terminals";
import { create } from "zustand";

export type SessionState =
  | { status: "opening" }
  | { status: "open"; session: string | null }
  | { status: "ended"; session: string | null; code: number }
  | { status: "failed"; error: AgentError };

interface TerminalsStore {
  sessions: Record<string, SessionState>;
  /** The host of the login page a session is waiting on, by session. */
  links: Record<string, string>;
  /** The session whose provider page is open over its terminal. */
  login: string | null;
  /** The session whose search bar is open. */
  search: string | null;

  start: (
    id: string,
    serverId: string,
    kind: TerminalKind,
    project: string | null
  ) => Promise<void>;
  /** The same tab, a fresh process: what the reader asks for when one has ended. */
  restart: (
    id: string,
    serverId: string,
    kind: TerminalKind,
    project: string | null
  ) => Promise<void>;
  noteExit: (id: string, code: number) => void;
  noteLink: (id: string, host: string) => void;
  openLogin: (id: string, bounds: ViewBounds) => Promise<void>;
  moveLogin: (bounds: ViewBounds) => void;
  closeLogin: () => void;
  noteLoginClosed: (id: string) => void;
  openSearch: (id: string) => void;
  closeSearch: () => void;
  forget: (id: string) => void;
  reset: () => void;
}

const COLS = 80;
const ROWS = 24;

function without<T>(held: Record<string, T>, id: string): Record<string, T> {
  const { [id]: _gone, ...rest } = held;

  return rest;
}

export const useTerminals = create<TerminalsStore>((set, get) => ({
  links: {},
  login: null,
  search: null,
  sessions: {},

  // A tab that mounts twice must not start two sessions on the machine.
  async start(id, serverId, kind, project) {
    if (get().sessions[id]) {
      return;
    }

    set((state) => ({
      sessions: { ...state.sessions, [id]: { status: "opening" } },
    }));

    const answer = await window.pupitre.openTerminal(
      id,
      serverId,
      kind,
      project,
      COLS,
      ROWS
    );

    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: answer.ok
          ? { session: answer.result.session, status: "open" }
          : { error: answer.error, status: "failed" },
      },
    }));
  },

  restart(id, serverId, kind, project) {
    get().forget(id);

    return get().start(id, serverId, kind, project);
  },

  /** The process is gone; the tab stays, with what it printed and the way out. */
  noteExit(id, code) {
    const current = get().sessions[id];

    if (current?.status !== "open") {
      return;
    }

    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { code, session: current.session, status: "ended" },
      },
    }));
  },

  noteLink(id, host) {
    set((state) => ({ links: { ...state.links, [id]: host } }));
  },

  async openLogin(id, bounds) {
    const opened = await window.pupitre.openLogin(id, bounds);

    set({ login: opened ? id : null });
  },

  moveLogin(bounds) {
    if (get().login) {
      window.pupitre.moveLogin(bounds);
    }
  },

  closeLogin() {
    window.pupitre.closeLogin();
    set({ login: null });
  },

  /** The round trip is over: the address is spent, and so is the button. */
  noteLoginClosed(id) {
    set((state) => ({
      links: without(state.links, id),
      login: state.login === id ? null : state.login,
    }));
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
      login: state.login === id ? null : state.login,
      search: state.search === id ? null : state.search,
      sessions: without(state.sessions, id),
    }));
  },

  reset() {
    set({ links: {}, login: null, search: null, sessions: {} });
  },
}));
