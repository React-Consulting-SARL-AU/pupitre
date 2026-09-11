const COMMAND = /^[a-z0-9_./~$][^\n]*$/;

const SENTENCE_END = /[.!?…]$/;

/** A remedy phrased as something to type, rather than something to do. */
export function looksLikeCommand(fix: string): boolean {
  const line = fix.trim();

  return COMMAND.test(line) && !SENTENCE_END.test(line);
}
