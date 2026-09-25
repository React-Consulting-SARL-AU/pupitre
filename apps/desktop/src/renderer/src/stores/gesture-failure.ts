import { create } from "zustand";

interface GestureFailureStore {
  // A gesture error no screen caught; `count` bumps so a repeat still shows.
  failure: { text: string; count: number } | null;
  fail: (text: string) => void;
  dismiss: () => void;
}

export const useGestureFailure = create<GestureFailureStore>((set) => ({
  failure: null,

  fail(text) {
    set((state) => ({
      failure: { count: (state.failure?.count ?? 0) + 1, text },
    }));
  },

  dismiss() {
    set({ failure: null });
  },
}));
