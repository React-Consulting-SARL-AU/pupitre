/**
 * A suggestion offered under a terminal line.
 *
 * The grammar comes from the agent (`completions`), the history from the
 * server's shell and the paths from its disk. What a candidate looks like on
 * screen is the app's own business, so it is described here.
 */
export type CandidateKind = "command" | "argument" | "path" | "history";

export interface Candidate {
  /** What replaces the current token — or the whole line, for history. */
  text: string;
  kind: CandidateKind;
  help?: string;
}
