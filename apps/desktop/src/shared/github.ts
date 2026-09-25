export interface GithubRepo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  /** Empty for a repository that has never been pushed to. */
  pushedAt: string;
  cloneUrl: string;
}
