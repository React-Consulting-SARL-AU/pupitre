import { getSearchQuery, type SearchQuery, search } from "@codemirror/search";
import type { EditorState, Extension } from "@codemirror/state";
import type { EditorView, Panel } from "@codemirror/view";

/** Past this many matches the count stops: the reader wants a number, not a wait. */
export const MATCH_CAP = 1000;

export interface Matches {
  total: number;
  /** The rank of the match under the cursor, when the cursor sits on one. */
  current: number | null;
  capped: boolean;
}

export interface SearchSnapshot {
  query: SearchQuery;
  matches: Matches;
}

/** What the search panel reads from the editor, and how it hears of a change. */
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

/**
 * The search extension with the app's own panel in place of CodeMirror's.
 *
 * CodeMirror owns the panel's place and its DOM node; the app renders into
 * the node once it is mounted and stops when it is destroyed. Every change
 * the panel shows — the query, the text, the cursor — is read from the
 * editor's state and pushed to whoever listens.
 */
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
