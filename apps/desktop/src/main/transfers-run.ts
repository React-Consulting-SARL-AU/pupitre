import type { ChildProcess } from "node:child_process";
import { spawn as spawnChild } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import type { FsStatResult } from "@pupitre/shared/agent-protocol/files";
import type { AgentError, AgentResponse } from "@shared/agent";
import {
  settled,
  type Transfer,
  type TransferKind,
  type TransferList,
  type TransferTool,
  UNSETTLED,
} from "@shared/transfers";
import type { Platform } from "./platform";
import { refusalOf, refuseWith } from "./refusal";
import { argument } from "./ssh-config";
import {
  expectedRevision,
  type JsonObject,
  keepCopy,
  migrate,
  REVISION_KEY,
} from "./store-migrations";
import { trace } from "./trace";
import {
  TRANSFERS_BASELINE,
  TRANSFERS_MIGRATIONS,
} from "./transfers-migrations";

/**
 * The queue of files moving between this computer and the servers.
 *
 * Each transfer is one `rsync` on the app's own SSH configuration, which
 * reuses the master session the agent's channel opened: no second
 * authentication, no second key. `rsync` resumes a cut file where it stopped;
 * where it is missing on either side, `scp` carries the file whole and the two
 * digests are compared at the end. Two run at once, the rest wait their turn,
 * and a link that drops relaunches the transfer with a growing delay.
 *
 * Nothing here knows Electron: the channels, the dialogs and the window are
 * in `transfers.ts`, and a test replays everything with a stubbed `spawn`.
 */

export const SLOTS = 2;
export const MAX_ATTEMPTS = 5;
export const FIRST_DELAY_MS = 1000;
export const MAX_DELAY_MS = 30_000;
/** How often at most the renderer is told about bytes on their way. */
export const PROGRESS_INTERVAL_MS = 250;
const POLL_INTERVAL_MS = 500;
const STDERR_LIMIT = 2000;
const SHA256 = /^[0-9a-f]{64}$/;

/** rsync: socket I/O, protocol stream, timeout; ssh itself: 255. */
const NETWORK_EXITS = new Set([10, 12, 30, 255]);

/**
 * `--info=progress2`: the bytes so far, the share of the whole, the rate, the
 * time — left when the transfer runs, elapsed on the closing line that names
 * the file count. Lines arrive on `\r` more often than on `\n`.
 */
const PROGRESS =
  /(\d[\d,.]*)\s+(\d{1,3})%\s+(\d+(?:\.\d+)?)([kKMGT]?)B\/s\s+(\d+):(\d{2}):(\d{2})/;
const CLOSING = /xfr#\d+/;
const LINE_BREAK = /[\r\n]/;
const LINE_BREAKS = /[\r\n]+/;
const TRAILING_SLASHES = /\/+$/;
const RSYNC_VERSION = /^rsync\s+version\s+(\d+)\.(\d+)/m;
const MIN_RSYNC = { major: 3, minor: 1 };

const UNIT: Record<string, number> = {
  "": 1,
  G: 1_000_000_000,
  k: 1000,
  K: 1000,
  M: 1_000_000,
  T: 1_000_000_000_000,
};

export const TRANSFERS_VERSION = Math.max(
  TRANSFERS_BASELINE,
  expectedRevision(TRANSFERS_MIGRATIONS)
);

export interface Progress {
  done: number;
  percent: number;
  rate: number;
  remaining: number;
}

export type ProcessSpawn = (command: string, args: string[]) => ChildProcess;

/** What the disk of this computer says of a path, read by the main process. */
export interface LocalFiles {
  stat: (path: string) => { kind: TransferKind; size: number } | null;
  hash: (path: string) => Promise<string>;
  ensureDir: (path: string) => void;
  readStore: (path: string) => string | null;
  writeStore: (path: string, text: string) => void;
}

export interface TransferDeps {
  /** The `ssh` arguments that name a server, or nothing if it is unknown. */
  resolve: (serverId: string) => string[] | null;
  /** The absolute folder the agent's `fs.*` paths count from. */
  root: (serverId: string) => Promise<string | null>;
  /** `fs.stat`, with the digest when asked. */
  stat: (
    serverId: string,
    path: string,
    hash: boolean
  ) => Promise<AgentResponse<FsStatResult>>;
  publish: (list: TransferList) => void;
  storePath: string;
  platform: Platform;
  spawn?: ProcessSpawn;
  local?: LocalFiles;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  rsyncCandidates?: string[];
}

export interface TransferQueue {
  list: () => TransferList;
  /** A local path the user just pointed at, and only then a path the queue accepts. */
  designate: (path: unknown) => string | null;
  /** Whether a path is one the user pointed at through this queue's dialogs. */
  designated: (path: unknown) => path is string;
  upload: (
    serverId: unknown,
    remoteDir: unknown,
    localPaths: unknown
  ) => Promise<AgentResponse<TransferList>>;
  download: (
    serverId: unknown,
    remotePath: unknown,
    localPath: unknown
  ) => Promise<AgentResponse<TransferList>>;
  pause: (id: unknown) => TransferList;
  resume: (id: unknown) => TransferList;
  cancel: (id: unknown) => TransferList;
  dismiss: (id: unknown) => TransferList;
  /** What a previous launch left unfinished, listed as paused. */
  restore: () => TransferList;
  /** Kills what runs and writes what is left, for the app closing. */
  shutdown: () => void;
}

type Intent = "run" | "pause" | "cancel";

interface Held {
  child: ChildProcess;
  intent: Intent;
  poller: ReturnType<typeof setInterval> | null;
  stderr: string;
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

function refuse(id: string, values?: Record<string, string | number>) {
  return refuseWith("bad_request", id, values);
}

/** The remedy of a transfer that stopped: an entry of the renderer's dictionary. */
function failure(
  id: string,
  values?: Record<string, string | number>
): AgentError {
  return refusalOf("internal", id, values);
}

export function backoffMs(attempt: number): number {
  return Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** Math.max(0, attempt - 1));
}

export function isNetworkExit(code: number | null): boolean {
  return code !== null && NETWORK_EXITS.has(code);
}

/**
 * A path under the agent's root, as the renderer may name one: relative,
 * never climbing, never a line break or a NUL that a shell would read as
 * something else. The root itself is the empty string.
 */
export function remoteRelative(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    LINE_BREAK.test(value)
  ) {
    return null;
  }

  const trimmed = value.replace(TRAILING_SLASHES, "");

  if (trimmed.startsWith("/")) {
    return null;
  }

  const segments = trimmed.length === 0 ? [] : trimmed.split("/");

  return segments.every((one) => one !== "" && one !== "." && one !== "..")
    ? segments.join("/")
    : null;
}

export function parseProgress(text: string): Progress | null {
  const segments = text.split(LINE_BREAKS);

  for (let at = segments.length - 1; at >= 0; at -= 1) {
    const segment = segments[at] ?? "";
    const found = PROGRESS.exec(segment);

    if (!found) {
      continue;
    }

    const [, bytes, percent, rate, unit, hours, minutes, seconds] = found;
    const time =
      Number(hours) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);

    return {
      done: Number((bytes ?? "0").replace(/\D/g, "")),
      percent: Number(percent),
      rate: Math.round(Number(rate) * (UNIT[unit ?? ""] ?? 1)),
      remaining: CLOSING.test(segment) ? 0 : time,
    };
  }

  return null;
}

/** Whether `rsync --version` named one that knows `--info=progress2`. */
export function capableRsync(versionOutput: string): boolean {
  const found = RSYNC_VERSION.exec(versionOutput);

  if (!found) {
    return false;
  }

  const major = Number(found[1]);
  const minor = Number(found[2]);

  return (
    major > MIN_RSYNC.major ||
    (major === MIN_RSYNC.major && minor >= MIN_RSYNC.minor)
  );
}

/** The `ssh` a transfer rides on: the app's configuration, quoted for rsync's `-e`. */
function shellOf(sshArgs: string[]): string {
  return ["ssh", ...sshArgs.slice(0, -1).map(argument)].join(" ");
}

function hostOf(sshArgs: string[]): string {
  return sshArgs.at(-1) ?? "";
}

/** The rsync source and destination, the folder's contents when it is one. */
function endpoints(
  transfer: Pick<Transfer, "direction" | "kind" | "localPath">,
  remote: string
): [string, string] {
  const suffix = transfer.kind === "dir" ? "/" : "";

  return transfer.direction === "upload"
    ? [`${transfer.localPath}${suffix}`, remote]
    : [`${remote}${suffix}`, transfer.localPath];
}

export function rsyncArgs(
  transfer: Pick<Transfer, "direction" | "kind" | "localPath">,
  sshArgs: string[],
  remoteAbsolute: string
): string[] {
  const [source, destination] = endpoints(
    transfer,
    `${hostOf(sshArgs)}:${remoteAbsolute}`
  );

  return [
    "-e",
    shellOf(sshArgs),
    "--partial",
    "--append-verify",
    "--info=progress2",
    "--no-inc-recursive",
    ...(transfer.kind === "dir" ? ["-r"] : []),
    source,
    destination,
  ];
}

/**
 * The same move by `scp`: a folder lands in its parent, where `scp -r`
 * creates it by name, whether or not one is already there.
 */
export function scpArgs(
  transfer: Pick<Transfer, "direction" | "kind" | "localPath">,
  sshArgs: string[],
  remoteAbsolute: string
): string[] {
  const folder = transfer.kind === "dir";
  const host = hostOf(sshArgs);
  const remoteTarget = folder
    ? `${host}:${dirname(remoteAbsolute)}`
    : `${host}:${remoteAbsolute}`;
  const localTarget = folder ? dirname(transfer.localPath) : transfer.localPath;
  const [source, destination] =
    transfer.direction === "upload"
      ? [transfer.localPath, remoteTarget]
      : [`${host}:${remoteAbsolute}`, localTarget];

  return [
    ...sshArgs.slice(0, -1),
    ...(folder ? ["-r"] : []),
    source,
    destination,
  ];
}

function defaultSpawn(command: string, args: string[]): ChildProcess {
  return spawnChild(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function sha256Of(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");

    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

const DISK: LocalFiles = {
  ensureDir: (path) => mkdirSync(path, { recursive: true }),
  hash: sha256Of,
  readStore: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
  stat: (path) => {
    try {
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return { kind: "dir", size: 0 };
      }

      return stat.isFile() ? { kind: "file", size: stat.size } : null;
    } catch {
      return null;
    }
  },
  writeStore: (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  },
};

function candidatesOn(platform: Platform): string[] {
  return platform === "darwin"
    ? ["rsync", "/opt/homebrew/bin/rsync", "/usr/local/bin/rsync"]
    : ["rsync"];
}

function under(dir: string, name: string): string {
  return dir.length === 0 ? name : `${dir}/${name}`;
}

function restoredTransfer(raw: unknown): Transfer | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const held = raw as Partial<Transfer>;

  if (
    typeof held.id !== "string" ||
    typeof held.serverId !== "string" ||
    (held.direction !== "upload" && held.direction !== "download") ||
    (held.kind !== "file" && held.kind !== "dir") ||
    typeof held.localPath !== "string" ||
    !isAbsolute(held.localPath) ||
    remoteRelative(held.remotePath) === null
  ) {
    return null;
  }

  return {
    attempt: typeof held.attempt === "number" ? held.attempt : 0,
    direction: held.direction,
    done: typeof held.done === "number" ? held.done : 0,
    endedAt: null,
    error: null,
    id: held.id,
    kind: held.kind,
    localPath: held.localPath,
    name: typeof held.name === "string" ? held.name : basename(held.localPath),
    rate: null,
    remaining: null,
    remotePath: held.remotePath as string,
    serverId: held.serverId,
    startedAt: typeof held.startedAt === "number" ? held.startedAt : 0,
    status: "paused",
    tool: held.tool === "scp" ? "scp" : "rsync",
    total: typeof held.total === "number" ? held.total : null,
  };
}

export function createTransferQueue(deps: TransferDeps): TransferQueue {
  const spawn = deps.spawn ?? defaultSpawn;
  const local = deps.local ?? DISK;
  const now = deps.now ?? Date.now;
  const wait =
    deps.wait ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const transfers: Transfer[] = [];
  const held = new Map<string, Held>();
  const designated = new Set<string>();
  const remoteRsync = new Map<string, boolean>();

  let localRsync: string | null | undefined;
  let revision = 0;
  let counter = 0;
  let progressTimer: ReturnType<typeof setTimeout> | null = null;
  let storeFrozen = false;

  function list(): TransferList {
    return { revision, transfers: transfers.map((one) => ({ ...one })) };
  }

  function publish(): TransferList {
    revision += 1;

    if (progressTimer) {
      clearTimeout(progressTimer);
      progressTimer = null;
    }

    const snapshot = list();

    deps.publish(snapshot);

    return snapshot;
  }

  function publishProgress(): void {
    if (progressTimer) {
      return;
    }

    progressTimer = setTimeout(() => {
      progressTimer = null;
      revision += 1;
      deps.publish(list());
    }, PROGRESS_INTERVAL_MS);
  }

  function persist(): void {
    if (storeFrozen) {
      return;
    }

    const kept = transfers
      .filter((one) => UNSETTLED.includes(one.status))
      .map(
        ({ error: _error, rate: _rate, remaining: _remaining, ...rest }) => ({
          ...rest,
          endedAt: null,
        })
      );

    local.writeStore(
      deps.storePath,
      `${JSON.stringify({ [REVISION_KEY]: TRANSFERS_VERSION, transfers: kept }, null, 2)}\n`
    );
  }

  function byId(id: unknown): Transfer | null {
    return typeof id === "string"
      ? (transfers.find((one) => one.id === id) ?? null)
      : null;
  }

  function update(id: string, patch: Partial<Transfer>): Transfer | null {
    const at = transfers.findIndex((one) => one.id === id);

    if (at < 0) {
      return null;
    }

    const next = { ...(transfers[at] as Transfer), ...patch };

    transfers[at] = next;

    return next;
  }

  function run(command: string, args: string[]): Promise<Run | null> {
    return new Promise((resolve) => {
      let child: ChildProcess;

      try {
        child = spawn(command, args);
      } catch {
        resolve(null);

        return;
      }

      const out: string[] = [];
      const err: string[] = [];

      child.stdout?.on("data", (chunk: Buffer | string) =>
        out.push(String(chunk))
      );
      child.stderr?.on("data", (chunk: Buffer | string) =>
        err.push(String(chunk))
      );
      child.on("error", () => resolve(null));
      child.on("exit", (code) =>
        resolve({ code, stderr: err.join(""), stdout: out.join("") })
      );
    });
  }

  /** The one rsync of this computer that can do the job, looked for once. */
  async function rsyncHere(): Promise<string | null> {
    if (localRsync !== undefined) {
      return localRsync;
    }

    for (const candidate of deps.rsyncCandidates ??
      candidatesOn(deps.platform)) {
      const answer = await run(candidate, ["--version"]);

      if (answer?.code === 0 && capableRsync(answer.stdout)) {
        localRsync = candidate;
        trace("transfer", "rsync-local", { command: candidate });

        return candidate;
      }
    }

    localRsync = null;
    trace("transfer", "rsync-local-missing");

    return null;
  }

  /** Whether the server has rsync, asked once per server and per session. */
  async function rsyncThere(
    serverId: string,
    sshArgs: string[]
  ): Promise<boolean | null> {
    const known = remoteRsync.get(serverId);

    if (known !== undefined) {
      return known;
    }

    const answer = await run("ssh", [
      "-o",
      "BatchMode=yes",
      ...sshArgs,
      "command -v rsync",
    ]);

    if (answer === null || isNetworkExit(answer.code)) {
      return null;
    }

    const present = answer.code === 0;

    remoteRsync.set(serverId, present);
    trace("transfer", "rsync-remote", { present, serverId });

    return present;
  }

  async function toolFor(
    serverId: string,
    sshArgs: string[]
  ): Promise<{ tool: TransferTool; command: string } | null> {
    const here = await rsyncHere();

    if (here === null) {
      return { command: "scp", tool: "scp" };
    }

    const there = await rsyncThere(serverId, sshArgs);

    if (there === null) {
      return null;
    }

    return there
      ? { command: here, tool: "rsync" }
      : { command: "scp", tool: "scp" };
  }

  function running(): number {
    return transfers.filter((one) => one.status === "running").length;
  }

  function stopPolling(entry: Held): void {
    if (entry.poller) {
      clearInterval(entry.poller);
      entry.poller = null;
    }
  }

  /** `scp` says nothing while it works: a download at least shows the file growing. */
  function pollLocal(
    transfer: Transfer
  ): ReturnType<typeof setInterval> | null {
    if (transfer.tool !== "scp" || transfer.direction !== "download") {
      return null;
    }

    return setInterval(() => {
      const seen = local.stat(transfer.localPath);

      if (seen?.kind === "file") {
        update(transfer.id, { done: seen.size });
        publishProgress();
      }
    }, POLL_INTERVAL_MS);
  }

  async function verified(transfer: Transfer): Promise<AgentError | null> {
    if (transfer.tool !== "scp" || transfer.kind !== "file") {
      return null;
    }

    const remote = await deps.stat(
      transfer.serverId,
      transfer.remotePath,
      true
    );

    if (!remote.ok) {
      return remote.error;
    }

    const here = local.stat(transfer.localPath);
    const digest = here
      ? await local.hash(transfer.localPath).catch(() => "")
      : "";

    return here?.size === remote.result.size_bytes &&
      SHA256.test(digest) &&
      digest === remote.result.sha256
      ? null
      : failure("refusal.transfer.mismatch", { name: transfer.name });
  }

  async function settle(
    transfer: Transfer,
    entry: Held,
    code: number | null
  ): Promise<void> {
    stopPolling(entry);
    held.delete(transfer.id);

    const reason = entry.stderr.trim().split("\n").at(-1) ?? "";

    trace("transfer", "exit", { code, id: transfer.id, reason });

    if (entry.intent === "cancel") {
      update(transfer.id, {
        endedAt: now(),
        rate: null,
        remaining: null,
        status: "cancelled",
      });
    } else if (entry.intent === "pause") {
      update(transfer.id, { rate: null, remaining: null, status: "paused" });
    } else if (code === 0) {
      const problem = await verified(transfer);

      update(
        transfer.id,
        problem
          ? {
              endedAt: now(),
              error: problem,
              rate: null,
              remaining: null,
              status: "failed",
            }
          : {
              done: transfer.total ?? transfer.done,
              endedAt: now(),
              error: null,
              rate: null,
              remaining: 0,
              status: "done",
            }
      );
    } else if (isNetworkExit(code) && transfer.attempt < MAX_ATTEMPTS) {
      const error = failure("refusal.transfer.retrying", {
        attempt: transfer.attempt,
        max: MAX_ATTEMPTS,
      });

      update(transfer.id, {
        error,
        rate: null,
        remaining: null,
        status: "queued",
      });
      persist();
      publish();
      await wait(backoffMs(transfer.attempt));

      const current = byId(transfer.id);

      if (current?.status === "queued") {
        pump();
      }

      return;
    } else {
      update(transfer.id, {
        endedAt: now(),
        error: failedWith(code, transfer),
        rate: null,
        remaining: null,
        status: "failed",
      });
    }

    persist();
    publish();
    pump();
  }

  function failedWith(code: number | null, transfer: Transfer): AgentError {
    if (isNetworkExit(code)) {
      return failure("refusal.transfer.network", { max: MAX_ATTEMPTS });
    }

    if (code === 11) {
      return failure("refusal.transfer.io", { name: transfer.name });
    }

    if (code === 23 || code === 24) {
      return failure("refusal.transfer.partial", { name: transfer.name });
    }

    return failure("refusal.transfer.failed", {
      code: code ?? "?",
      name: transfer.name,
      tool: transfer.tool,
    });
  }

  function onProgress(transfer: Transfer, chunk: string): void {
    const progress = parseProgress(chunk);

    if (!progress) {
      return;
    }

    const current = byId(transfer.id);

    if (current?.status !== "running") {
      return;
    }

    const total =
      current.total ??
      (progress.percent > 0
        ? Math.round((progress.done * 100) / progress.percent)
        : null);

    update(transfer.id, {
      done: progress.done,
      rate: progress.rate,
      remaining: progress.remaining,
      total,
    });
    publishProgress();
  }

  async function start(transfer: Transfer): Promise<void> {
    const sshArgs = deps.resolve(transfer.serverId);

    if (!sshArgs) {
      update(transfer.id, {
        endedAt: now(),
        error: failure("refusal.server.unknown"),
        status: "failed",
      });
      persist();
      publish();
      pump();

      return;
    }

    const attempt = transfer.attempt + 1;

    update(transfer.id, { attempt, error: null, status: "running" });
    publish();

    const chosen = await toolFor(transfer.serverId, sshArgs);
    const root = chosen ? await deps.root(transfer.serverId) : null;
    const current = byId(transfer.id);

    if (current?.status !== "running") {
      return;
    }

    if (!(chosen && root)) {
      const entry: Held = {
        child: { kill: () => true } as ChildProcess,
        intent: "run",
        poller: null,
        stderr: "",
      };

      held.set(transfer.id, entry);
      await settle(
        { ...current, tool: chosen?.tool ?? current.tool },
        entry,
        chosen ? 5 : 255
      );

      return;
    }

    const remoteAbsolute = under(root, current.remotePath);
    const args =
      chosen.tool === "rsync"
        ? rsyncArgs(current, sshArgs, remoteAbsolute)
        : scpArgs(current, sshArgs, remoteAbsolute);

    if (current.direction === "download") {
      local.ensureDir(dirname(current.localPath));
    }

    const started = update(transfer.id, { tool: chosen.tool }) ?? current;

    trace("transfer", "start", {
      attempt,
      direction: started.direction,
      id: started.id,
      kind: started.kind,
      tool: started.tool,
    });

    let child: ChildProcess;

    try {
      child = spawn(chosen.command, args);
    } catch {
      const entry: Held = {
        child: { kill: () => true } as ChildProcess,
        intent: "run",
        poller: null,
        stderr: "",
      };

      held.set(transfer.id, entry);
      await settle(started, entry, 127);

      return;
    }

    const entry: Held = {
      child,
      intent: "run",
      poller: pollLocal(started),
      stderr: "",
    };

    held.set(transfer.id, entry);
    publish();

    child.stdout?.on("data", (chunk: Buffer | string) =>
      onProgress(started, String(chunk))
    );
    child.stderr?.on("data", (chunk: Buffer | string) => {
      entry.stderr = `${entry.stderr}${String(chunk)}`.slice(-STDERR_LIMIT);
    });
    child.on("error", () => {
      if (held.get(started.id) === entry) {
        settle(started, entry, 127);
      }
    });
    child.on("exit", (code) => {
      if (held.get(started.id) === entry) {
        settle(byId(started.id) ?? started, entry, code);
      }
    });
  }

  function pump(): void {
    for (const transfer of transfers) {
      if (running() >= SLOTS) {
        return;
      }

      if (transfer.status === "queued" && !held.has(transfer.id)) {
        start(transfer);
      }
    }
  }

  function enqueue(transfer: Transfer): void {
    transfers.push(transfer);
    persist();
    publish();
    pump();
  }

  function nextId(): string {
    counter += 1;

    return `t${counter.toString(36)}${now().toString(36)}`;
  }

  function fresh(
    serverId: string,
    direction: Transfer["direction"],
    kind: TransferKind,
    remotePath: string,
    localPath: string,
    total: number | null
  ): Transfer {
    return {
      attempt: 0,
      direction,
      done: 0,
      endedAt: null,
      error: null,
      id: nextId(),
      kind,
      localPath,
      name: basename(localPath) || basename(remotePath),
      rate: null,
      remaining: null,
      remotePath,
      serverId,
      startedAt: now(),
      status: "queued",
      tool: "rsync",
      total,
    };
  }

  function stop(id: unknown, intent: Intent): TransferList {
    const transfer = byId(id);

    if (!transfer || settled(transfer)) {
      return list();
    }

    const entry = held.get(transfer.id);

    if (entry) {
      entry.intent = intent;
      entry.child.kill();

      return list();
    }

    update(transfer.id, {
      endedAt: intent === "cancel" ? now() : null,
      error: null,
      rate: null,
      remaining: null,
      status: intent === "cancel" ? "cancelled" : "paused",
    });
    persist();

    return publish();
  }

  function queued(
    serverId: unknown,
    remoteDir: unknown,
    localPaths: unknown
  ): AgentResponse<TransferList> {
    if (typeof serverId !== "string" || !deps.resolve(serverId)) {
      return refuse("refusal.server.unknown");
    }

    const dir = remoteRelative(remoteDir);

    if (dir === null) {
      return refuse("refusal.transfer.remotePath");
    }

    if (!Array.isArray(localPaths) || localPaths.length === 0) {
      return refuse("refusal.transfer.localPath");
    }

    const chosen: Transfer[] = [];

    for (const candidate of localPaths) {
      if (typeof candidate !== "string" || !designated.has(candidate)) {
        return refuse("refusal.transfer.localPath");
      }

      const seen = local.stat(candidate);

      if (!seen) {
        return refuse("refusal.transfer.localMissing", {
          name: basename(candidate),
        });
      }

      chosen.push(
        fresh(
          serverId,
          "upload",
          seen.kind,
          under(dir, basename(candidate)),
          candidate,
          seen.kind === "file" ? seen.size : null
        )
      );
    }

    for (const transfer of chosen) {
      enqueue(transfer);
    }

    return { ok: true, result: list() };
  }

  return {
    list,

    designate(path) {
      if (typeof path !== "string" || path.length === 0 || !isAbsolute(path)) {
        return null;
      }

      designated.add(path);

      return path;
    },

    designated(path): path is string {
      return typeof path === "string" && designated.has(path);
    },

    upload(serverId, remoteDir, localPaths) {
      return Promise.resolve(queued(serverId, remoteDir, localPaths));
    },

    async download(serverId, remotePath, localPath) {
      if (typeof serverId !== "string" || !deps.resolve(serverId)) {
        return refuse("refusal.server.unknown");
      }

      const path = remoteRelative(remotePath);

      if (path === null || path.length === 0) {
        return refuse("refusal.transfer.remotePath");
      }

      if (typeof localPath !== "string" || !designated.has(localPath)) {
        return refuse("refusal.transfer.localPath");
      }

      const remote = await deps.stat(serverId, path, false);

      if (!remote.ok) {
        return remote;
      }

      const name = basename(path);
      const kind: TransferKind = remote.result.kind === "dir" ? "dir" : "file";
      const target =
        local.stat(localPath)?.kind === "dir"
          ? join(localPath, name)
          : localPath;

      enqueue(
        fresh(
          serverId,
          "download",
          kind,
          path,
          target,
          kind === "file" ? remote.result.size_bytes : null
        )
      );

      return { ok: true, result: list() };
    },

    pause(id) {
      return stop(id, "pause");
    },

    resume(id) {
      const transfer = byId(id);

      if (transfer?.status !== "paused") {
        return list();
      }

      update(transfer.id, { error: null, status: "queued" });
      persist();

      const snapshot = publish();

      pump();

      return snapshot;
    },

    cancel(id) {
      return stop(id, "cancel");
    },

    dismiss(id) {
      const transfer = byId(id);

      if (!(transfer && settled(transfer))) {
        return list();
      }

      transfers.splice(transfers.indexOf(transfer), 1);

      return publish();
    },

    restore() {
      const text = local.readStore(deps.storePath);

      if (text === null) {
        return list();
      }

      try {
        const raw = JSON.parse(text) as JsonObject;
        const from =
          typeof raw[REVISION_KEY] === "number" ? raw[REVISION_KEY] : 0;

        if (from > TRANSFERS_VERSION) {
          storeFrozen = true;
          trace("transfer", "store-newer", { revision: from });

          return list();
        }

        const migrated = migrate(raw, TRANSFERS_MIGRATIONS);

        if (migrated.applied.length > 0) {
          keepCopy(deps.storePath, from);
        }

        const kept = Array.isArray(migrated.document.transfers)
          ? migrated.document.transfers
          : [];

        for (const one of kept) {
          const transfer = restoredTransfer(one);

          if (transfer && !byId(transfer.id)) {
            transfers.push(transfer);
          }
        }

        counter = transfers.length;
      } catch {
        trace("transfer", "store-unreadable");
      }

      persist();

      return publish();
    },

    shutdown() {
      for (const entry of held.values()) {
        entry.intent = "pause";
        stopPolling(entry);
        entry.child.kill();
      }

      for (const transfer of transfers) {
        if (transfer.status === "running") {
          update(transfer.id, { status: "paused" });
        }
      }

      persist();
    },
  };
}
