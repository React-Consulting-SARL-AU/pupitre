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
import { useTranslations } from "@renderer/i18n/use-translations";
import { languageFor } from "@renderer/lib/editor-language";
import { editorLook } from "@renderer/lib/editor-theme";
import { nameOf } from "@renderer/lib/files";
import { useEffect, useRef } from "react";

/**
 * The text of one file, in a CodeMirror view the component owns.
 *
 * The view is built once per file and torn down with it; a save keeps the
 * view and its history, a fresh read replaces the text under it. Every change
 * is handed up as the whole buffer — a file the channel carries is a megabyte
 * at most, and the store is what knows whether the buffer still reads as the
 * file. The grammar comes in after the view, when the file has one.
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

  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const initial = useRef(draft ?? text);
  initial.current = draft ?? text;
  const label = t("files.editor.label", { name: nameOf(path) });
  const labelRef = useRef(label);
  labelRef.current = label;

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
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current();

                return true;
              },
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
          editorLook(),
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
    <div
      className="min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-sunken"
      data-editor={path}
      ref={host}
    />
  );
}
