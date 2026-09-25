import { ANSI_DARK, ANSI_LIGHT, type AnsiPalette } from "@pupitre/design/ansi";
import type { ResolvedTheme } from "@shared/appearance";

export type TerminalTheme = AnsiPalette & {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
};

export type TokenReader = (name: string) => string;

export function readTokens(root: Element): TokenReader {
  const style = getComputedStyle(root);

  return (name) => style.getPropertyValue(name).trim();
}

/** Keeps an ANSI palette because Claude Code, Codex and CLI tools depend on it; the rest comes from tokens. */
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
