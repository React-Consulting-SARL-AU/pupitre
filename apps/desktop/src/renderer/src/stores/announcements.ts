import { create } from "zustand";

export type Urgency = "polite" | "assertive";

interface Announcement {
  text: string;
  // Bumped on every say, so the same sentence twice is announced twice.
  count: number;
}

interface AnnouncementStore {
  polite: Announcement;
  assertive: Announcement;
  say: (text: string, urgency?: Urgency) => void;
  clear: () => void;
}

const SILENCE: Announcement = { count: 0, text: "" };

export const useAnnouncements = create<AnnouncementStore>((set) => ({
  assertive: SILENCE,
  polite: SILENCE,

  say(text, urgency = "polite") {
    set((state) => ({
      [urgency]: { count: state[urgency].count + 1, text },
    }));
  },

  clear() {
    set({ assertive: SILENCE, polite: SILENCE });
  },
}));

export function announce(text: string, urgency: Urgency = "polite"): void {
  useAnnouncements.getState().say(text, urgency);
}
