/**
 * A repository of the connected GitHub account, as the screen shows it.
 *
 * The token that read it never leaves the main process: what crosses the bridge
 * is this — a name to pick from, the branch the repository opens on, whether it
 * is private, and the day it last moved. Nothing here is a credential, and
 * nothing here is a decision: the agent still reads the repository before the
 * project is declared.
 */
export interface GithubRepo {
  /** `owner/name`, the way GitHub itself writes it. */
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  /** ISO 8601, or an empty string for a repository that has never been pushed to. */
  pushedAt: string;
  /** The HTTPS address the agent would clone. */
  cloneUrl: string;
}
