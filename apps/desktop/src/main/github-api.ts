import type { GithubRepo } from "@shared/github";

/**
 * The client's GitHub account, seen from the laptop.
 *
 * The token stays in this process, exactly as Cloudflare's does: the window
 * asks for a list of repositories and gets a list of repositories. Nothing of
 * the account reaches the server either — a repository the agent clones is
 * cloned with the machine's own git identity, which the `tool.github` module
 * puts there.
 */

const ENDPOINT = "https://api.github.com";

/** A call that has not answered by then is not going to: the screen is owed a refusal. */
const CALL_MS = 20_000;

const PER_PAGE = 100;

/**
 * Five hundred repositories is more than anyone scrolls, and the field filters
 * what the list holds. Someone with more than that types the address instead.
 */
const MAX_PAGES = 5;

export class GithubError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GithubError";
    this.status = status;
  }
}

export interface GithubApi {
  repos: () => Promise<GithubRepo[]>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A row GitHub answered, kept only when it names a repository we could clone. */
function repoOf(value: unknown): GithubRepo | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const fullName = text(raw.full_name);
  const cloneUrl = text(raw.clone_url);

  if (!(fullName && cloneUrl)) {
    return null;
  }

  const owner =
    typeof raw.owner === "object" && raw.owner !== null
      ? text((raw.owner as Record<string, unknown>).login)
      : "";

  return {
    cloneUrl,
    defaultBranch: text(raw.default_branch),
    fullName,
    name: text(raw.name) || fullName,
    owner: owner || fullName.split("/")[0] || "",
    private: raw.private === true,
    pushedAt: text(raw.pushed_at) || text(raw.updated_at),
  };
}

export function githubApi(
  token: string,
  fetcher: typeof fetch = fetch
): GithubApi {
  const call = async (path: string): Promise<unknown[]> => {
    const response = await fetcher(`${ENDPOINT}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(CALL_MS),
    });

    const body = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const said =
        typeof body === "object" && body !== null
          ? text((body as Record<string, unknown>).message)
          : "";

      throw new GithubError(
        said || `HTTP ${String(response.status)}`,
        response.status
      );
    }

    return Array.isArray(body) ? body : [];
  };

  return {
    /**
     * Everything the account can push to, the most recently touched first.
     *
     * `affiliation` is what makes an organisation's repository show up beside a
     * personal one: without it GitHub answers only what the account owns, and
     * the repository the client actually works in is missing from the list.
     */
    async repos() {
      const found: GithubRepo[] = [];

      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const rows = await call(
          `/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=${PER_PAGE}&page=${page}`
        );

        for (const row of rows) {
          const repo = repoOf(row);

          if (repo) {
            found.push(repo);
          }
        }

        if (rows.length < PER_PAGE) {
          break;
        }
      }

      return found;
    },
  };
}
