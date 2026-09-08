import { create } from "zustand";

/**
 * What a reader who does not watch the screen is told.
 *
 * A step crossed, a module installed, a channel lost and found: each is written
 * here, and the shell's live regions read it out. `polite` waits for a gap in
 * what is being read; `assertive` interrupts, and is kept for what stops the
 * work. The counter is what makes the same sentence twice a second
 * announcement rather than a silence.
 */

export type Urgency = "polite" | "assertive";

interface Announcement {
  text: string;
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

/** Said from anywhere, including a store that has no hook to hand. */
export function announce(text: string, urgency: Urgency = "polite"): void {
  useAnnouncements.getState().say(text, urgency);
}
