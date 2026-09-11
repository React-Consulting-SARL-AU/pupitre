import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * The editor in the interface's own greys.
 *
 * Nothing here holds a colour: every value is a design token read through
 * `var()`, so the editor follows the theme the moment the root switches, with
 * no repaint of its own. The syntax is told apart by the step of grey and by
 * the weight or the slant, never by a hue — a keyword is ink and bold, a
 * string one step down, a comment two steps down in italic, punctuation the
 * lightest ink. The screen reads the same in pure greys because it is in pure
 * greys.
 */

const INK = "var(--ink)";
const INK_2 = "var(--ink-2)";
const INK_3 = "var(--ink-3)";
const INK_4 = "var(--ink-4)";

const BOLD = "600";

export const editorHighlight = HighlightStyle.define([
  {
    color: INK,
    fontWeight: BOLD,
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
    color: INK,
    fontWeight: BOLD,
    tag: [
      tags.definition(tags.variableName),
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.className,
      tags.typeName,
      tags.namespace,
      tags.tagName,
      tags.heading,
    ],
  },
  { color: INK, tag: [tags.variableName, tags.name, tags.propertyName] },
  { color: INK_2, tag: [tags.attributeName, tags.labelName] },
  {
    color: INK_2,
    tag: [
      tags.string,
      tags.special(tags.string),
      tags.regexp,
      tags.number,
      tags.bool,
      tags.null,
      tags.atom,
      tags.literal,
      tags.url,
    ],
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
  { tag: tags.invalid, textDecoration: "underline" },
]);

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
    { backgroundColor: "var(--raised)" },
  ".cm-activeLine": { backgroundColor: "var(--surface)" },
  ".cm-selectionMatch": { backgroundColor: "var(--raised)" },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "transparent",
    outline: "1px solid var(--line-strong)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--sunken)",
    borderRight: "1px solid var(--line)",
    color: INK_4,
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
  ".cm-panel.cm-search": { padding: "6px 10px" },
  ".cm-panel.cm-search label": { color: INK_2, fontSize: "12px" },
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
  },
  ".cm-tooltip": {
    ...FIELD,
    boxShadow: "var(--shadow-overlay)",
  },
});

/** The look of the editor, complete: the frame and the syntax. */
export function editorLook(): Extension {
  return [editorTheme, syntaxHighlighting(editorHighlight)];
}
