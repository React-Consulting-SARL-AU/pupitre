import { create } from "zustand";
import { translate } from "../i18n/translate";
import { announce } from "./announcements";
import { serversIn, useServers } from "./servers";

/**
 * The link to each server, as it drops and comes back.
 *
 * An SSH session over a laptop's wifi drops; that is its ordinary life. What a
 * screen owes the reader is to say so, rather than to sit on a step that has
 * stopped for no reason they can see. Nothing here reconnects: the next command
 * opens a channel of its own, and this only says where things stand.
 */

export type ChannelState = "open" | "lost";

interface ChannelStore {
  states: Readonly<Record<string, ChannelState>>;
  note: (serverId: string, state: ChannelState) => void;
  stateOf: (serverId: string | null) => ChannelState;
  listen: () => () => void;
}

/** What the reader calls the machine: its name in the list, or its identifier when the list does not hold it. */
function nameOf(serverId: string): string {
  return (
    serversIn(useServers.getState().config).find(
      (server) => server.id === serverId
    )?.name ?? serverId
  );
}

export const useChannel = create<ChannelStore>((set, get) => ({
  states: {},

  note(serverId, state) {
    const before = get().states[serverId];

    set((held) => ({ states: { ...held.states, [serverId]: state } }));

    if (before && before !== state) {
      announce(
        translate()(
          state === "lost"
            ? "onboarding.channel.lost"
            : "onboarding.channel.back",
          { name: nameOf(serverId) }
        ),
        state === "lost" ? "assertive" : "polite"
      );
    }
  },

  /** A server nobody has spoken to yet is not a server whose link is broken. */
  stateOf(serverId) {
    return serverId ? (get().states[serverId] ?? "open") : "open";
  },

  listen() {
    return (
      window.pupitre.onChannel?.((change) =>
        get().note(change.serverId, change.state)
      ) ?? (() => undefined)
    );
  },
}));
