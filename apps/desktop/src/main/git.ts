import type {
  FileChange,
  FileDiff,
  GitStatus,
  WorkingTree,
} from "@shared/contract";
import { runScript } from "./ssh";

/**
 * What the server knows about the gap between a folder and its remote.
 *
 * Nothing here goes through the admin command: not every machine has a git
 * subcommand, whereas every machine hosting a versioned project has git. So we
 * query git itself, read-only, and the only possible write is the fast-forward
 * asked for explicitly.
 */
export type GitTarget = { project: string; path: string };

const PATH_OK = /^\/[\w.\-/]{1,200}$/;

export function validPath(path: string): boolean {
  return PATH_OK.test(path) && !path.includes("..");
}

/**
 * A path inside a repository, on its way into a remote `git -- <path>`.
 *
 * It comes back from the renderer, which got it from a list we produced — but it
 * did leave the process, so it is re-checked here rather than trusted. A quote
 * would close the one we wrap it in; a newline would end the command.
 */
const REPO_PATH_OK = /^[\w.\-/ +@#%,=()[\]{}!~^&$:;]{1,300}$/;

function validRepoPath(path: string): boolean {
  return (
    REPO_PATH_OK.test(path) &&
    !path.includes("..") &&
    !path.startsWith("/") &&
    !path.includes("'")
  );
}

/**
 * The script read by the remote shell, once for all projects.
 *
 * One SSH round trip per repository would cost more than the reading itself, and
 * `git fetch` talks to the network: one long command beats a dozen short ones.
 * Repositories shared by several projects are queried only once — it is the same
 * `.git`.
 */
function script(targets: GitTarget[], fetch: boolean): string {
  const calls = targets
    .map((t) => `read_one '${t.project}' '${t.path}'`)
    .join("\n");

  return `
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND='ssh -o BatchMode=yes'
FETCH=${fetch ? 1 : 0}
LIMIT=""
command -v timeout >/dev/null 2>&1 && LIMIT="timeout 25"
seen=""
failed=""
read_one() {
  name=$1
  cd "$2" 2>/dev/null || { printf '%s\\t0\\n' "$name"; return; }
  root=$(git rev-parse --show-toplevel 2>/dev/null) || { printf '%s\\t0\\n' "$name"; return; }
  problem=""
  if [ "$FETCH" = 1 ]; then
    case " $seen " in
      *" $root "*) ;;
      *)
        seen="$seen $root"
        if ! why=$($LIMIT git fetch --quiet --prune 2>&1); then
          failed="$failed $root"
          problem=$(printf '%s' "$why" | tr '\\n\\t' '  ')
          [ -n "$problem" ] || problem="remote repository unreachable"
        fi
        ;;
    esac
  fi
  case " $failed " in
    *" $root "*) [ -n "$problem" ] || problem="remote repository unreachable" ;;
  esac
  current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || upstream=""
  behind=0
  ahead=0
  last=0
  subject=""
  if [ -n "$upstream" ]; then
    behind=$(git rev-list --count "HEAD..$upstream" 2>/dev/null || echo 0)
    ahead=$(git rev-list --count "$upstream..HEAD" 2>/dev/null || echo 0)
    last=$(git log -1 --format=%ct "$upstream" 2>/dev/null || echo 0)
    subject=$(git log -1 --format=%s "$upstream" 2>/dev/null | tr '\\n\\t' '  ')
  fi
  dirty=0
  [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ] && dirty=1
  # Untracked files count as changes for the badge, but not for \`dirty\`: they
  # never block a fast-forward, and refusing a pull because of them would be
  # refusing it for no reason.
  changed=$(git status --porcelain --untracked-files=all 2>/dev/null | grep -c . || echo 0)
  printf '%s\\t1\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \\
    "$name" "$root" "$current" "$upstream" "$behind" "$ahead" "$dirty" "$last" "$subject" "$problem" "$changed"
}
${calls}
`.trim();
}

function number(raw: string | undefined): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? value : 0;
}

function missing(project: string): GitStatus {
  return {
    project,
    repo: false,
    root: "",
    current: "",
    upstream: "",
    behind: 0,
    ahead: 0,
    dirty: false,
    changed: 0,
    last: 0,
    subject: "",
    problem: "",
  };
}

function readLine(line: string, expected: Set<string>): GitStatus | null {
  const fields = line.split("\t");
  const project = fields[0];
  if (!expected.has(project)) {
    return null;
  }
  if (fields[1] !== "1") {
    return missing(project);
  }
  return {
    project,
    repo: true,
    root: fields[2] ?? "",
    current: fields[3] ?? "",
    upstream: fields[4] ?? "",
    behind: number(fields[5]),
    ahead: number(fields[6]),
    dirty: fields[7] === "1",
    last: number(fields[8]),
    subject: (fields[9] ?? "").slice(0, 120),
    problem: (fields[10] ?? "").slice(0, 160),
    changed: number(fields[11]),
  };
}

export async function inspect(
  targets: GitTarget[],
  fetch: boolean
): Promise<GitStatus[]> {
  if (targets.length === 0) {
    return [];
  }
  // The time of one network `fetch` per repository, plus room for a slow one:
  // it is long, and that is why it does not go through the shared channel.
  const timeout = fetch ? 30_000 + targets.length * 25_000 : 25_000;
  const res = await runScript(script(targets, fetch), timeout);
  const expected = new Set(targets.map((t) => t.project));

  const read = new Map<string, GitStatus>();
  for (const line of res.output.split("\n")) {
    const status = readLine(line.trim(), expected);
    if (status) {
      read.set(status.project, status);
    }
  }

  return targets.map((t) => read.get(t.project) ?? missing(t.project));
}

/**
 * The fast-forward, and nothing else.
 *
 * `--ff-only` refuses to merge and refuses to rewind: at worst the command fails
 * and the folder stays as it was. It is the only write this console allows
 * itself in a repository — resolving a conflict happens in a terminal, where you
 * can see what you are doing.
 */
export async function pull(
  path: string
): Promise<{ ok: boolean; message: string }> {
  const res = await runScript(
    `cd '${path}' && GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes' git pull --ff-only 2>&1`,
    120_000
  );
  return { ok: res.code === 0, message: res.output.trim() };
}

/**
 * The whole working tree in one round trip.
 *
 * Three readings would be three round trips: `git status` for the list,
 * `git diff --numstat` for the counts of what is not staged, the same
 * `--cached` for what is. So they go out together, prefixed by a letter, and
 * are stitched back together here.
 *
 * Untracked files have no numstat — git has nothing to compare them against. We
 * count their lines ourselves, and `grep -Iq` tells us whether that even makes
 * sense: it finds nothing in a binary file, which is exactly the question.
 */
function workingTreeScript(path: string): string {
  return `
cd '${path}' 2>/dev/null || { printf 'NOREPO\\n'; exit 0; }
root=$(git rev-parse --show-toplevel 2>/dev/null) || { printf 'NOREPO\\n'; exit 0; }
cd "$root" || exit 0
printf 'ROOT\\t%s\\n' "$root"
printf 'BRANCH\\t%s\\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
up=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || up=""
printf 'UP\\t%s\\n' "$up"
if [ -n "$up" ]; then
  printf 'AHEAD\\t%s\\n'  "$(git rev-list --count "$up..HEAD" 2>/dev/null || echo 0)"
  printf 'BEHIND\\t%s\\n' "$(git rev-list --count "HEAD..$up" 2>/dev/null || echo 0)"
fi
git status --porcelain=v1 --untracked-files=all 2>/dev/null | sed 's/^/S\\t/'
git diff --numstat 2>/dev/null          | sed 's/^/W\\t/'
git diff --cached --numstat 2>/dev/null | sed 's/^/I\\t/'
git ls-files --others --exclude-standard 2>/dev/null | while IFS= read -r f; do
  if grep -Iq . "$f" 2>/dev/null; then
    printf 'U\\t%s\\t%s\\n' "$(wc -l < "$f" 2>/dev/null | tr -d ' ')" "$f"
  else
    printf 'U\\t-\\t%s\\n' "$f"
  fi
done
`.trim();
}

/** `git status` quotes a path with unusual characters. We unwrap it. */
function unquote(path: string): string {
  if (!(path.startsWith('"') && path.endsWith('"'))) {
    return path;
  }
  try {
    return JSON.parse(path) as string;
  } catch {
    return path.slice(1, -1);
  }
}

function stageOf(code: string): FileChange["stage"] {
  if (code === "??") {
    return "untracked";
  }
  // The first letter is the index, the second the working tree. A file can be
  // both; we show it as staged, since that is the state that would be committed.
  return code[0] !== " " && code[0] !== "?" ? "staged" : "unstaged";
}

export async function workingTree(
  project: string,
  path: string
): Promise<WorkingTree> {
  const empty: WorkingTree = {
    project,
    repo: false,
    root: "",
    branch: "",
    upstream: "",
    ahead: 0,
    behind: 0,
    files: [],
  };

  const res = await runScript(workingTreeScript(path), 30_000);
  if (res.output.includes("NOREPO")) {
    return empty;
  }

  const tree: WorkingTree = { ...empty, repo: true };
  const files = new Map<string, FileChange>();
  const counts = new Map<string, { added: number; removed: number }>();

  const put = (file: string, code: string, from?: string) => {
    const clean = unquote(file);
    files.set(clean, {
      path: clean,
      code,
      stage: stageOf(code),
      added: 0,
      removed: 0,
      binary: false,
      ...(from ? { from: unquote(from) } : {}),
    });
  };

  for (const raw of res.output.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const tab = line.indexOf("\t");
    if (tab === -1) {
      continue;
    }
    const tag = line.slice(0, tab);
    const rest = line.slice(tab + 1);

    switch (tag) {
      case "ROOT":
        tree.root = rest;
        break;
      case "BRANCH":
        tree.branch = rest;
        break;
      case "UP":
        tree.upstream = rest;
        break;
      case "AHEAD":
        tree.ahead = number(rest);
        break;
      case "BEHIND":
        tree.behind = number(rest);
        break;
      case "S": {
        // "XY path", or "XY old -> new" for a rename.
        const code = rest.slice(0, 2);
        const target = rest.slice(3);
        const arrow = target.indexOf(" -> ");
        if (arrow === -1) {
          put(target, code);
        } else {
          put(target.slice(arrow + 4), code, target.slice(0, arrow));
        }
        break;
      }
      case "W":
      case "I": {
        // "added<TAB>removed<TAB>path", with "-" for a binary file.
        const [added, removed, ...pathParts] = rest.split("\t");
        const file = unquote(pathParts.join("\t"));
        const known = counts.get(file) ?? { added: 0, removed: 0 };
        if (added === "-") {
          counts.set(file, { added: -1, removed: -1 });
        } else {
          counts.set(file, {
            added: known.added < 0 ? -1 : known.added + number(added),
            removed: known.removed < 0 ? -1 : known.removed + number(removed),
          });
        }
        break;
      }
      case "U": {
        const [added, ...pathParts] = rest.split("\t");
        const file = unquote(pathParts.join("\t"));
        counts.set(
          file,
          added === "-"
            ? { added: -1, removed: -1 }
            : { added: number(added), removed: 0 }
        );
        break;
      }
      default:
        break;
    }
  }

  for (const [path_, count] of counts) {
    const entry = files.get(path_);
    if (!entry) {
      continue;
    }
    entry.binary = count.added < 0;
    entry.added = Math.max(0, count.added);
    entry.removed = Math.max(0, count.removed);
  }

  // Staged first, then unstaged, then untracked, alphabetical inside each: the
  // order you would want to read them in, and stable between two refreshes.
  const rank = { staged: 0, unstaged: 1, untracked: 2 };
  tree.files = [...files.values()].sort(
    (a, b) => rank[a.stage] - rank[b.stage] || a.path.localeCompare(b.path)
  );

  return tree;
}

/**
 * One file's diff, against HEAD.
 *
 * Against HEAD and not against the index: what you want to read on a project
 * page is everything that has changed since the last commit, staged or not, in
 * one patch. An untracked file has no HEAD version — `--no-index` against
 * /dev/null gives it the same shape as the others.
 */
export async function fileDiff(
  projectPath: string,
  path: string,
  untracked: boolean
): Promise<FileDiff> {
  const empty: FileDiff = { path, patch: "", binary: false, problem: "" };

  if (!validPath(projectPath)) {
    return { ...empty, problem: "invalid project path" };
  }
  if (!validRepoPath(path)) {
    return { ...empty, problem: "this file name cannot be sent to git" };
  }

  // The paths in the list are relative to the repository root, so the script
  // walks up to it itself. Asking the caller for the root would mean reading the
  // whole working tree again just to learn something git knows in one call.
  const command = untracked
    ? `git diff --no-color --no-index -- /dev/null './${path}'`
    : `git diff --no-color --unified=3 HEAD -- './${path}'`;

  // `git diff --no-index` returns 1 when the files differ, which is the normal
  // case here: the exit code says nothing, only the output does.
  const res = await runScript(
    [
      `cd '${projectPath}' 2>/dev/null || { echo '__NOROOT__'; exit 0; }`,
      `root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo '__NOREPO__'; exit 0; }`,
      `cd "$root" || { echo '__NOROOT__'; exit 0; }`,
      `${command} 2>&1`,
    ].join("\n"),
    30_000
  );

  if (res.output.includes("__NOROOT__")) {
    return { ...empty, problem: "repository folder unreachable" };
  }
  if (res.output.includes("__NOREPO__")) {
    return { ...empty, problem: "not a git repository" };
  }

  const patch = res.output.replace(/\r/g, "");
  if (
    /^Binary files .* differ$/m.test(patch) ||
    /^GIT binary patch$/m.test(patch)
  ) {
    return { ...empty, binary: true };
  }
  // A patch of several megabytes would freeze the renderer for no benefit: past
  // that size nobody reads it line by line anyway.
  const LIMIT = 400_000;
  if (patch.length > LIMIT) {
    return {
      ...empty,
      patch: patch.slice(0, LIMIT),
      problem: "diff truncated — open it in a terminal to see all of it",
    };
  }

  return { ...empty, patch };
}
