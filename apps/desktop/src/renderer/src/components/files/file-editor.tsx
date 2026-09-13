import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { editorPhrases } from "@renderer/i18n/editor-phrases";
import { useTranslations } from "@renderer/i18n/use-translations";
import { languageFor } from "@renderer/lib/editor-language";
import {
  type SearchPanelHandle,
  searchPanel,
} from "@renderer/lib/editor-search";
import { editorLook } from "@renderer/lib/editor-theme";
import { nameOf } from "@renderer/lib/files";
import { useTheme } from "@renderer/stores/theme";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileSearchPanel } from "./file-search-panel";

/**
 * The text of one file, in a CodeMirror view the component owns.
 *
 * The view is built once per file and torn down with it; a save keeps the
 * view and its history, a fresh read replaces the text under it. Every change
 * is handed up as the whole buffer — a file the channel carries is a megabyte
 * at most, and the store is what knows whether the buffer still reads as the
 * file. The grammar comes in after the view, when the file has one, and the
 * look follows the theme: the syntax takes the palette of the theme in force.
 * The search panel is the app's own, rendered into the slot CodeMirror opens
 * for it and spoken in the reader's language, as are the editor's own words.
 */
export function FileEditor({
  path,
  text,
  draft,
  onChange,
  onSave,
}: {
  path: string;
  /** What the file reads as on the server, as of the last read or write. */
  text: string;
  /** The buffer as the reader left it, when it differs from the file. */
  draft: string | null;
  onChange: (text: string) => void;
  onSave: () => void;
}) {
  const t = useTranslations();
  const resolved = useTheme((s) => s.resolved);

  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const look = useRef(new Compartment());
  const phrases = useRef(new Compartment());
  const [search, setSearch] = useState<SearchPanelHandle | null>(null);
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const initial = useRef(draft ?? text);
  initial.current = draft ?? text;
  const label = t("files.editor.label", { name: nameOf(path) });
  const labelRef = useRef(label);
  labelRef.current = label;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const container = host.current;

    if (!container) {
      return;
    }

    const language = new Compartment();
    let alive = true;

    const editor = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          EditorView.contentAttributes.of({ "aria-label": labelRef.current }),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          searchPanel({ close: () => setSearch(null), open: setSearch }),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current();

                return true;
              },
              scope: "editor search-panel",
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          look.current.of(editorLook(resolvedRef.current)),
          phrases.current.of(editorPhrases(tRef.current)),
          language.of([]),
        ],
      }),
    });

    view.current = editor;

    languageFor(nameOf(path)).then((support) => {
      if (alive && support) {
        editor.dispatch({ effects: language.reconfigure(support) });
      }
    });

    return () => {
      alive = false;
      editor.destroy();
      view.current = null;
    };
  }, [path]);

  useEffect(() => {
    view.current?.dispatch({
      effects: look.current.reconfigure(editorLook(resolved)),
    });
  }, [resolved]);

  useEffect(() => {
    view.current?.dispatch({
      effects: phrases.current.reconfigure(editorPhrases(t)),
    });
  }, [t]);

  // A fresh read puts the file's text under the cursor; a save leaves the
  // buffer alone, since the buffer is what was saved.
  useEffect(() => {
    const editor = view.current;

    if (!editor || draft !== null) {
      return;
    }

    const current = editor.state.doc.toString();

    if (current !== text) {
      editor.dispatch({
        changes: { from: 0, insert: text, to: current.length },
      });
    }
  }, [text, draft]);

  return (
    <>
      <div
        className="min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-sunken"
        data-editor={path}
        ref={host}
      />

      {search
        ? createPortal(<FileSearchPanel panel={search} />, search.dom)
        : null}
    </>
  );
}
