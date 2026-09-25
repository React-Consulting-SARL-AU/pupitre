const COMMAND = /^[a-z0-9_./~$][^\n]*$/;

const SENTENCE_END = /[.!?…]$/;

export function looksLikeCommand(fix: string): boolean {
  const line = fix.trim();

  return COMMAND.test(line) && !SENTENCE_END.test(line);
}
