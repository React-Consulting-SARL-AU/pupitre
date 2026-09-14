import { EditorState, type Extension } from "@codemirror/state";
import type { Translate } from "./i18n";

/** The words CodeMirror speaks on its own — to a reader, and on the go-to-line panel. */
export function editorPhrases(t: Translate): Extension {
  return EditorState.phrases.of({
    "current match": t("files.search.announce.current"),
    go: t("files.search.go"),
    "Go to line": t("files.search.gotoLine"),
    "on line": t("files.search.announce.onLine"),
    "replaced $ matches": t("files.search.announce.replacedAll"),
    "replaced match on line $": t("files.search.announce.replacedOne"),
  });
}
