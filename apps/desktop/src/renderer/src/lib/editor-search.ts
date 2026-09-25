import { getSearchQuery, type SearchQuery, search } from "@codemirror/search";
import type { EditorState, Extension } from "@codemirror/state";
import type { EditorView, Panel } from "@codemirror/view";

/** Counting stops here so a huge file never stalls the panel. */
export const MATCH_CAP = 1000;

export interface Matches {
  total: number;
  current: number | null;
  capped: boolean;
}

export interface SearchSnapshot {
  query: SearchQuery;
  matches: Matches;
}

export interface SearchPanelHandle {
  dom: HTMLElement;
  view: EditorView;
  read: () => SearchSnapshot;
  subscribe: (listener: () => void) => () => void;
}

export function countMatches(state: EditorState, query: SearchQuery): Matches {
  if (!query.valid) {
    return { capped: false, current: null, total: 0 };
  }

  const { from, to } = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let current: number | null = null;

  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    total += 1;

    if (step.value.from === from && step.value.to === to) {
      current = total;
    }

    if (total >= MATCH_CAP) {
      return { capped: true, current, total };
    }
  }

  return { capped: false, current, total };
}

function snapshotOf(state: EditorState): SearchSnapshot {
  const query = getSearchQuery(state);

  return { matches: countMatches(state, query), query };
}

export function searchPanel(watch: {
  open: (panel: SearchPanelHandle) => void;
  close: () => void;
}): Extension {
  return search({
    createPanel(view): Panel {
      const dom = document.createElement("div");
      const listeners = new Set<() => void>();
      let snapshot = snapshotOf(view.state);

      const handle: SearchPanelHandle = {
        dom,
        read: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);

          return () => {
            listeners.delete(listener);
          };
        },
        view,
      };

      return {
        destroy: () => watch.close(),
        dom,
        mount: () => watch.open(handle),
        top: true,
        update(update) {
          const changed =
            update.docChanged ||
            update.selectionSet ||
            getSearchQuery(update.state) !== getSearchQuery(update.startState);

          if (!changed) {
            return;
          }

          snapshot = snapshotOf(update.state);

          for (const listener of listeners) {
            listener();
          }
        },
      };
    },
  });
}
