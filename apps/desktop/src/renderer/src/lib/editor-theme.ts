import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { ANSI_DARK, ANSI_LIGHT, type AnsiPalette } from "@pupitre/design/ansi";
import type { ResolvedTheme } from "@shared/appearance";

const INK = "var(--ink)";
const INK_2 = "var(--ink-2)";
const INK_3 = "var(--ink-3)";
const INK_4 = "var(--ink-4)";
// The palette's yellow and cyan fall short of text contrast on light, hence `warn` for literals and grey for attributes.
const AMBER = "var(--warn)";

const BOLD = "600";

function paletteOf(resolved: ResolvedTheme): AnsiPalette {
  return resolved === "dark" ? ANSI_DARK : ANSI_LIGHT;
}

export function editorHighlight(resolved: ResolvedTheme): HighlightStyle {
  const ansi = paletteOf(resolved);

  return HighlightStyle.define([
    {
      color: ansi.magenta,
      tag: [
        tags.keyword,
        tags.modifier,
        tags.controlKeyword,
        tags.operatorKeyword,
        tags.definitionKeyword,
        tags.moduleKeyword,
      ],
    },
    {
      color: ansi.blue,
      tag: [
        tags.definition(tags.variableName),
        tags.function(tags.variableName),
        tags.function(tags.propertyName),
        tags.className,
        tags.typeName,
        tags.namespace,
        tags.tagName,
      ],
    },
    { color: INK, fontWeight: BOLD, tag: tags.heading },
    { color: INK, tag: [tags.variableName, tags.name, tags.propertyName] },
    { color: INK_2, tag: [tags.attributeName, tags.labelName] },
    {
      color: ansi.green,
      tag: [tags.string, tags.special(tags.string), tags.regexp, tags.url],
    },
    {
      color: AMBER,
      tag: [tags.number, tags.bool, tags.null, tags.atom, tags.literal],
    },
    {
      color: INK_3,
      fontStyle: "italic",
      tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    },
    { color: INK_3, tag: [tags.meta, tags.processingInstruction] },
    {
      color: INK_4,
      tag: [tags.punctuation, tags.separator, tags.bracket, tags.operator],
    },
    { fontStyle: "italic", tag: tags.emphasis },
    { fontWeight: BOLD, tag: tags.strong },
    { tag: tags.link, textDecoration: "underline" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { color: ansi.red, tag: tags.invalid, textDecoration: "underline" },
  ]);
}

const FIELD = {
  backgroundColor: "var(--sunken)",
  border: "1px solid var(--line-strong)",
  borderRadius: "var(--radius-sm)",
  color: INK,
  fontFamily: "var(--font-data)",
};

export const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--sunken)",
    color: INK,
    fontSize: "12px",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-data)",
    lineHeight: "1.6",
  },
  ".cm-content": {
    caretColor: INK,
    padding: "8px 0",
  },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: INK },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--line-strong)" },
  // The app's global ::selection inverts the ink, which vanishes on the grey layer CodeMirror draws behind the text.
  ".cm-content ::selection, .cm-content::selection": { color: "currentColor" },
  ".cm-activeLine": { backgroundColor: "var(--surface)" },
  ".cm-selectionMatch": { backgroundColor: "var(--raised)" },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "transparent",
    outline: "1px solid var(--line-strong)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--sunken)",
    borderRight: "1px solid var(--line)",
    color: INK_3,
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--surface)",
    color: INK_2,
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "40px",
    padding: "0 10px 0 12px",
  },
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    color: INK,
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--line)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--line)" },
  ".cm-panel.cm-goto-line": { padding: "6px 10px" },
  ".cm-panel.cm-goto-line label": { color: INK_2, fontSize: "12px" },
  ".cm-textfield": { ...FIELD, padding: "3px 8px" },
  ".cm-button": {
    ...FIELD,
    backgroundImage: "none",
    borderRadius: "var(--radius-full)",
    padding: "3px 10px",
  },
  ".cm-button:active": { backgroundImage: "none" },
  ".cm-searchMatch": {
    backgroundColor: "var(--raised)",
    outline: "1px solid var(--line-strong)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--line-strong)",
    outline: "1px solid var(--ink)",
  },
  ".cm-tooltip": {
    ...FIELD,
    boxShadow: "var(--shadow-overlay)",
  },
});

export function editorLook(resolved: ResolvedTheme): Extension {
  return [editorTheme, syntaxHighlighting(editorHighlight(resolved))];
}
