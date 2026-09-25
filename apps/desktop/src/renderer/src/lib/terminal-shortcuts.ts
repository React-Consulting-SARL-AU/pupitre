export type TerminalShortcut =
  | { kind: "new" }
  | { kind: "close" }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "tab"; index: number }
  | { kind: "search" }
  | { kind: "clear" }
  | { kind: "copy" }
  | { kind: "paste" }
  | { kind: "zoomIn" }
  | { kind: "zoomOut" }
  | { kind: "zoomReset" };

export interface KeyChord {
  type: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const NEXT = new Set(["]", "}", "ArrowRight", "Tab"]);
const PREVIOUS = new Set(["[", "{", "ArrowLeft"]);
const ZOOM_IN = new Set(["=", "+"]);
const ZOOM_OUT = new Set(["-", "_"]);
const DIGIT = /^[1-9]$/;

export function chordLabel(mac: boolean): string {
  return mac ? "⌘" : "Ctrl+Shift+";
}

/** Off macOS control belongs to the shell (^C, ^D), so shortcuts move to control+shift; macOS copies and pastes itself. */
export function shortcutOf(
  event: KeyChord,
  mac: boolean
): TerminalShortcut | null {
  if (event.type !== "keydown" || event.altKey) {
    return null;
  }

  const chord = mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && event.shiftKey && !event.metaKey;

  if (!chord) {
    return null;
  }

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (key === "Tab" && !event.shiftKey) {
    return { kind: "next" };
  }

  if (key === "Tab") {
    return { kind: "previous" };
  }

  if (NEXT.has(key)) {
    return { kind: "next" };
  }

  if (PREVIOUS.has(key)) {
    return { kind: "previous" };
  }

  if (ZOOM_IN.has(key)) {
    return { kind: "zoomIn" };
  }

  if (ZOOM_OUT.has(key)) {
    return { kind: "zoomOut" };
  }

  if (DIGIT.test(key)) {
    return { index: Number(key) - 1, kind: "tab" };
  }

  switch (key) {
    case "t":
      return { kind: "new" };
    case "w":
      return { kind: "close" };
    case "f":
      return { kind: "search" };
    case "k":
      return { kind: "clear" };
    case "0":
      return { kind: "zoomReset" };
    case "c":
      return mac ? null : { kind: "copy" };
    case "v":
      return mac ? null : { kind: "paste" };
    default:
      return null;
  }
}
