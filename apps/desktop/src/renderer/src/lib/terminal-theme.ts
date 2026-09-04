import { ANSI_DARK, ANSI_LIGHT, type AnsiPalette } from "@pupitre/design/ansi";
import type { ResolvedTheme } from "@shared/appearance";

export type TerminalTheme = AnsiPalette & {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
};

/** Reads a design token off an element, so nothing here holds a colour. */
export type TokenReader = (name: string) => string;

export function readTokens(root: Element): TokenReader {
  const style = getComputedStyle(root);
  return (name) => style.getPropertyValue(name).trim();
}

/**
 * The terminal keeps an ANSI palette because Claude Code, Codex and the tools
 * depend on it — desaturated, and different per theme. Everything around it
 * comes from the same tokens as the rest of the interface.
 */
export function terminalTheme(
  resolved: ResolvedTheme,
  token: TokenReader
): TerminalTheme {
  const ansi = resolved === "dark" ? ANSI_DARK : ANSI_LIGHT;

  return {
    ...ansi,
    background: token("--sunken"),
    foreground: token("--ink"),
    cursor: token("--ink"),
    cursorAccent: token("--sunken"),
    selectionBackground: token("--raised"),
  };
}
