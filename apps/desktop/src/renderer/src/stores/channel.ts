import { create } from "zustand";
import { translate } from "../i18n/translate";
import { announce } from "./announcements";
import { serversIn, useServers } from "./servers";

export type ChannelState = "open" | "lost";

interface ChannelStore {
  states: Readonly<Record<string, ChannelState>>;
  note: (serverId: string, state: ChannelState) => void;
  stateOf: (serverId: string | null) => ChannelState;
  listen: () => () => void;
}

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
