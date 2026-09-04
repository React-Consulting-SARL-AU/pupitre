/**
 * The contract with the server.
 *
 * These types describe exactly what the server's admin command returns — `dev`
 * by default, another name if the machine picked one. They are the only thing
 * the app knows about it: all the logic — which projects exist, on which port,
 * how to start them, which services are running — lives over there, never here.
 *
 * Anything that does not exist everywhere is optional. A server with no tunnel,
 * no database, no secret manager and no project registry is still a server this
 * console can drive; it simply shows fewer things, and nothing false.
 */

import type { ServerProfile } from "./profile";

export type ProjectState =
  | "online"
  | "starting"
  | "failed"
  | "stopped"
  | "external"
  | "service"
  | "down";

export type Project = {
  name: string;
  /**
   * The repository it belongs to.
   *
   * Several processes from the same repository share this group — an app and
   * its mail preview, an API and its client. A project alone in its group just
   * carries its own name.
   */
  group: string;
  state: ProjectState;
  host: string;
  port: number;
  url: string;
  branch: string;
  uptime: string;
  dir: string;
  ram_mb: number;
};

/**
 * Who owns the configuration that reaches this machine.
 *
 * "app": the address, the port, the account and the key belong to the app,
 * written into its own SSH file. "system": the host is a block of the user's
 * own ~/.ssh/config, and the app writes nothing at all for it.
 */
export type ServerOrigin = "app" | "system";

export type Server = {
  id: string;
  name: string;
  /** An address for an app server, a ~/.ssh/config alias for a system one. */
  host: string;
  port: number;
  /** The remote account. Empty on a system host: its own block says which. */
  user: string;
  origin: ServerOrigin;
  /** The private key in the app's folder. Absent on a system host. */
  keyPath?: string;
  /** The host key recorded on first contact. Absent: never contacted yet. */
  hostFingerprint?: string;
  /**
   * How that particular machine is driven: its command, its logs, its editor.
   * Absent on older configurations, filled in on read.
   */
  profile?: ServerProfile;
};

export type ServersConfig = {
  /** The file's shape, so we know what to fill in when re-reading it. */
  version?: number;
  servers: Server[];
  active: string | null;
};

/**
 * What this particular machine can do, observed rather than assumed.
 *
 * A console that assumes a secret manager, a project registry or an installed
 * agent shows empty pages on someone else's machine. Every capability is
 * therefore checked on connection, and the interface only shows what really
 * exists.
 */
export type Capabilities = {
  secrets: boolean;
  registry: boolean;
  sessions: boolean;
  logs: boolean;
  processes: boolean;
  /** The command-line agents present on the server. */
  agents: TerminalAgent[];
};

export type ProcessInfo = {
  pid: number;
  cpu: number;
  ram_mb: number;
  command: string;
  project: string;
};

export type Session = {
  pid: number;
  seconds: number;
  ram_mb: number;
  kind: "claude" | "codex" | "ide";
  command: string;
};

export type Branches = {
  /** False when the project folder is not a repository: there is nothing to manage. */
  repo: boolean;
  /** The folder that holds the .git — several projects may share it. */
  root: string;
  current: string;
  dirty: boolean;
  local: string[];
  remote: string[];
};

/**
 * The gap between a project's folder on the server and its remote repository.
 *
 * That is what you want to know before starting anything: what is running may
 * well be three commits behind without anything saying so. The fields are those
 * of a remote `git status`, never an interpretation — the console shows the
 * gap, it does not decide to close it.
 */
export type GitStatus = {
  project: string;
  /** False when the folder is not a repository: there is nothing to track. */
  repo: boolean;
  /** The folder that holds the .git — several projects may share it. */
  root: string;
  current: string;
  /** The upstream branch, "origin/main". Empty: the branch tracks none. */
  upstream: string;
  /** What is waiting to be pulled, and what is waiting to be pushed. */
  behind: number;
  ahead: number;
  /** Tracked but uncommitted changes: the pull will be refused. */
  dirty: boolean;
  /**
   * How many files the working tree has changed, untracked ones included.
   *
   * It comes with the rest of the status because it costs the same
   * `git status`: the project page can show "3 changes" without a second call.
   */
  changed: number;
  /** Timestamp of the last remote commit, in seconds. 0: unknown. */
  last: number;
  subject: string;
  /**
   * What prevented us from querying the remote repository.
   *
   * Without this, a server that is not allowed to read the repository would
   * show "up to date" — the worst of both worlds, since that is both false and
   * reassuring.
   */
  problem: string;
};

/**
 * One changed file of the working tree.
 *
 * `code` is the pair of letters `git status --porcelain` gives — index first,
 * then working tree — kept verbatim rather than interpreted: it says more than
 * any word we could put in its place, and git is the one who defines it.
 */
export type FileChange = {
  path: string;
  code: string;
  stage: "staged" | "unstaged" | "untracked";
  /** Lines added and removed. -1 when git could not count them (binary). */
  added: number;
  removed: number;
  binary: boolean;
  /** Set for a rename: where the file came from. */
  from?: string;
};

/**
 * The state of a repository's working tree, for the project page.
 *
 * This is what `git status` says, nothing more: the console shows the changes,
 * it never writes them. The branch and the counts are here too so that showing
 * a header costs one call rather than three.
 */
export type WorkingTree = {
  project: string;
  /** False when the folder is not a repository: there is nothing to show. */
  repo: boolean;
  root: string;
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  files: FileChange[];
};

/**
 * One file's diff, as git prints it.
 *
 * The patch is kept raw: parsing it into a structure and rendering that back
 * would be a second implementation of a format git already emits perfectly, and
 * the first hunk header it did not expect would break it.
 */
export type FileDiff = {
  path: string;
  patch: string;
  binary: boolean;
  /** What prevented reading the diff, if anything. */
  problem: string;
};

/** The command-line agents a terminal can carry. */
export type TerminalAgent = "claude" | "codex";

export type TerminalKind = "shell" | TerminalAgent | "tui";

/**
 * What a session is doing, inferred from its stream.
 *
 * None of this is read from the displayed text: the interfaces of Claude and
 * Codex change, and a signal based on their layout would be wrong at the first
 * redesign. So we watch the pipe — the PTY throughput, the terminal bell, the
 * death of the process.
 */
export type AgentState =
  | "working"
  | "attention"
  | "idle"
  | "asleep"
  | "finished";

export type Terminal = {
  id: string;
  kind: TerminalKind;
  title: string;
  project: string | null;
  dir: string | null;
};

/**
 * A registry row, as the server holds it.
 *
 * `origin` says where it comes from: "stack" for the file deployed from the
 * repository, "local" for what was added on the machine. Only local rows can be
 * removed from here — the others would come back on the next deployment.
 */
export type Registration = {
  name: string;
  dir: string;
  repo_url: string;
  package_manager: string;
  host: string;
  port: number;
  subdomain: string;
  command: string;
  /**
   * The install command, as the registry spells it — empty when it does not.
   *
   * `install_effective` is what will actually run: the same string, or the one
   * derived from the package manager. Both are returned because the form has to
   * edit one and show the other: "how were these dependencies installed" should
   * never be a guess, and a placeholder is how you say "this is what you get if
   * you leave it empty".
   */
  install: string;
  install_effective: string;
  origin: "stack" | "local";
  /**
   * True if the stack repository also carries a row with this name.
   *
   * Removing a local row that shadows one then does not delete the project: it
   * restores it to its original version.
   */
  overrides: boolean;
  repo: boolean;
  present: boolean;
};

export type Machine = {
  ram_total_mb: number;
  ram_used_mb: number;
  ram_free_mb: number;
  swap_mb: number;
  load: string;
  disk_total_mb: number;
  disk_free_mb: number;
  cores: number;
  uptime_hours: number;
  /** Raw counters: the percentage comes from the delta between two readings. */
  cpu_total: number;
  cpu_idle: number;
};

/**
 * A service the server announces, without the app knowing which one.
 *
 * A tunnel, a database, a queue, or nothing at all: the console does not keep
 * the list. It shows what the server names, and shows nothing when it names
 * nothing — which is the case for a machine with neither tunnel nor database,
 * and which remains a perfectly usable machine.
 */
export type ServerService = {
  key: string;
  label: string;
  /** The server's own word: "active", "inactive", "missing"… */
  state: string;
  ok: boolean;
};

export type Snapshot = {
  machine: Machine;
  /** Where the server keeps its projects. Never assumed by the app. */
  root: string;
  /** What the server reports running. Absent: it reports nothing. */
  services?: ServerService[];
  /**
   * The package managers it knows how to run, for the project form. Absent: the
   * usual list serves as a suggestion, and the field stays free.
   */
  package_managers?: string[];
  projects: Project[];
};

/** The four connection checks, in the order they get fixed. */
export type ConnectionStep =
  | "host"
  | "agent"
  | "authentication"
  | "multiplexing";

export type Diagnostic = {
  ok: boolean;
  step: ConnectionStep;
  title: string;
  detail: string;
  fix: string;
};

export type ConnectionState = {
  connected: boolean;
  host: string;
  diagnostics: Diagnostic[];
};

export type Action = "up" | "down" | "restart";

export type ActionResult = {
  ok: boolean;
  message: string;
};

export type LogLine = {
  project: string;
  text: string;
};

/**
 * The state of a server secret, never its value.
 *
 * A key marked `sensitive` never returns a preview: its length is enough to
 * know it is filled in, and that is all the interface needs.
 */
export type Secret = {
  key: string;
  set: boolean;
  length: number;
  sensitive: boolean;
  preview: string;
};

/**
 * The grammar of the admin command, as the server describes it.
 *
 * It powers terminal autocompletion. A list copied here would go stale at the
 * first subcommand added over there; so the server returns it itself
 * (`dev completions`), and a server that cannot do so simply has no grammar
 * completion — history and paths remain.
 */
export type SubCommand = {
  name: string;
  help: string;
  /**
   * The possible values of each argument, in order. "$project" stands for any
   * project in the snapshot.
   */
  args: string[][];
};

export type Catalog = {
  command: string;
  sub: SubCommand[];
};

export type CandidateKind = "command" | "argument" | "path" | "history";

export type Candidate = {
  /** What replaces the current token — or the whole line, for history. */
  text: string;
  kind: CandidateKind;
  help?: string;
};
