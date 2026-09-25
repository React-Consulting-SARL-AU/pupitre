import { create } from "zustand";

interface GestureFailureStore {
  /** The last gesture that stopped on an error nobody else caught, until it is put away. */
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
