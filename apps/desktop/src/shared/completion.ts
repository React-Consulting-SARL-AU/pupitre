export type CandidateKind = "command" | "argument" | "path" | "history";

export interface Candidate {
  /** Replaces the current token, or the whole line for history. */
  text: string;
  kind: CandidateKind;
  help?: string;
}
