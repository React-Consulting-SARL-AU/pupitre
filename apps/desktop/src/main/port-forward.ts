import type { ChildProcess } from "node:child_process";
import { spawn as spawnChild } from "node:child_process";
import { connect, createServer } from "node:net";
import type { AgentResponse } from "@shared/agent";
import type { PortForward } from "@shared/services";
import type { ForwardMemory } from "./forwards-memory";
import { refuseWith } from "./refusal";

const MAX_PORT = 65_535;
const LISTEN_TIMEOUT_MS = 8000;
const LISTEN_RETRY_MS = 150;

const RETRY_FIRST_MS = 2000;
const RETRY_MAX_MS = 60_000;
// A connection that held this long dropped for a reason of its own: the next try starts short again.
const STABLE_MS = 30_000;

export interface ForwardDeps {
  resolve: (serverId: string) => string[] | null;
  spawn?: (args: string[]) => ChildProcess;
  freePort?: () => Promise<number | null>;
  portFree?: (port: number) => Promise<boolean>;
  listening?: (port: number) => Promise<boolean>;
  later?: (run: () => void, ms: number) => void;
  now?: () => number;
  /** Reusing last time's local port keeps a desktop client's saved connection working. */
  memory?: ForwardMemory;
}

export interface ForwardOptions {
  /** Imposed: a sign-in that calls back `localhost:54545` only works on 54545. */
  localPort?: number;
  /** The server's own number when it is free here: an app pointed at `localhost:8081` reaches the server unchanged. */
  preferRemote?: boolean;
  keep?: boolean;
}

interface Held {
  forward: PortForward;
  child: ChildProcess;
  deps: ForwardDeps;
  failures: number;
  since: number;
  /** Bumped at each new `ssh`: the exit of one already replaced changes nothing. */
  generation: number;
}

const open = new Map<string, Held>();

let counter = 0;

type Watcher = (forwards: PortForward[]) => void;

const watchers = new Set<Watcher>();

export function watchForwards(watcher: Watcher): () => void {
  watchers.add(watcher);

  return () => {
    watchers.delete(watcher);
  };
}

function changed(): void {
  const list = forwards();

  for (const watcher of watchers) {
    watcher(list);
  }
}

function refuse(
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith("bad_request", id, values);
}

function borrowedPort(): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = createServer();

    probe.on("error", () => resolve(null));
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();

      probe.close(() =>
        resolve(address && typeof address === "object" ? address.port : null)
      );
    });
  });
}

function bindable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();

    probe.on("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolve(true));
    });
  });
}

function sshForward(args: string[]): ChildProcess {
  return spawnChild("ssh", args, { stdio: ["ignore", "ignore", "pipe"] });
}

function later(run: () => void, ms: number): void {
  setTimeout(run, ms);
}

export function forwards(serverId?: string): PortForward[] {
  return [...open.values()]
    .map((entry) => entry.forward)
    .filter((forward) => !serverId || forward.serverId === serverId);
}

function kept(forward: PortForward) {
  return {
    label: forward.label,
    localPort: forward.localPort,
    remotePort: forward.remotePort,
    serverId: forward.serverId,
  };
}

export function closeForward(id: unknown): PortForward[] {
  if (typeof id !== "string") {
    return forwards();
  }

  const held = open.get(id);

  if (!held) {
    return forwards();
  }

  open.delete(id);
  held.child.kill();

  if (held.forward.kept) {
    held.deps.memory?.release(held.forward.serverId, held.forward.remotePort);
  }

  changed();

  return forwards();
}

export function keepForward(id: unknown, keep: unknown): PortForward[] {
  const held = typeof id === "string" ? open.get(id) : undefined;

  if (!held || typeof keep !== "boolean") {
    return forwards();
  }

  held.forward = { ...held.forward, kept: keep };

  if (keep) {
    held.deps.memory?.keep(kept(held.forward));
  } else {
    held.deps.memory?.release(held.forward.serverId, held.forward.remotePort);
  }

  changed();

  return forwards();
}

/** Without a server, on the way out: everything closes. For one server, a kept forward restarts on its new settings. */
export function closeForwards(serverId?: string): void {
  let dropped = false;

  for (const [id, entry] of open) {
    if (serverId && entry.forward.serverId !== serverId) {
      continue;
    }

    if (serverId && entry.forward.kept) {
      entry.generation += 1;
      entry.child.kill();
      reconnect(id, entry);

      continue;
    }

    open.delete(id);
    entry.child.kill();
    dropped = true;
  }

  if (dropped) {
    changed();
  }
}

function existing(
  serverId: string,
  remotePort: number,
  localPort?: number
): Held | null {
  return (
    [...open.values()].find(
      (held) =>
        held.forward.serverId === serverId &&
        held.forward.remotePort === remotePort &&
        (localPort === undefined || held.forward.localPort === localPort)
    ) ?? null
  );
}

function attempt(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** `ssh -L` listens only after it authenticated: a browser sent there too early gets its own error page. */
export async function awaitListening(
  port: number,
  timeoutMs = LISTEN_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await attempt(port)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, LISTEN_RETRY_MS));
  }

  return false;
}

async function localPortFor(
  serverId: string,
  remotePort: number,
  deps: ForwardDeps,
  options: ForwardOptions
): Promise<{ localPort: number | null; movedFrom?: number }> {
  if (options.localPort !== undefined) {
    return { localPort: options.localPort };
  }

  const free = deps.portFree ?? bindable;

  if (options.preferRemote && (await free(remotePort))) {
    return { localPort: remotePort };
  }

  const recalled = deps.memory?.recall(serverId, remotePort) ?? null;

  if (recalled !== null && (await free(recalled))) {
    return { localPort: recalled };
  }

  const borrowed = await (deps.freePort ?? borrowedPort)();

  return recalled === null
    ? { localPort: borrowed }
    : { localPort: borrowed, movedFrom: recalled };
}

function spawnFor(forward: PortForward, args: string[], deps: ForwardDeps) {
  // Through the master a forward would live in the master, and survive the kill.
  return (deps.spawn ?? sshForward)([
    "-o",
    "BatchMode=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ControlMaster=no",
    "-o",
    "ControlPath=none",
    "-N",
    "-L",
    `${forward.localPort}:127.0.0.1:${forward.remotePort}`,
    ...args,
  ]);
}

function follow(id: string, held: Held): void {
  const generation = held.generation;

  held.child.on("exit", () => {
    if (open.get(id) !== held || held.generation !== generation) {
      return;
    }

    if (held.forward.kept) {
      reconnect(id, held);

      return;
    }

    open.delete(id);
    changed();
  });
}

function reconnect(id: string, held: Held): void {
  const now = held.deps.now ?? Date.now;
  const lived = now() - held.since;

  held.failures = lived >= STABLE_MS ? 0 : held.failures + 1;
  held.forward = { ...held.forward, reconnecting: true };
  changed();

  const wait = Math.min(
    RETRY_FIRST_MS * 2 ** Math.max(held.failures - 1, 0),
    RETRY_MAX_MS
  );
  const generation = held.generation;

  (held.deps.later ?? later)(() => {
    if (held.generation === generation) {
      respawn(id, held);
    }
  }, wait);
}

/** After a sleep a kept forward's `ssh` may hold a dead connection, or wait up to a minute for its next try. */
export function reviveKeptForwards(): void {
  for (const [id, held] of open) {
    if (!held.forward.kept) {
      continue;
    }

    const { child } = held;

    held.generation += 1;
    held.failures = 0;

    if (exited(child)) {
      respawn(id, held);
    } else {
      // The new `ssh` binds the same local port: it starts once the old one let go.
      child.once("exit", () => respawn(id, held));
      child.kill();
    }
  }
}

function exited(child: ChildProcess): boolean {
  return typeof child.exitCode === "number" || Boolean(child.signalCode);
}

function respawn(id: string, held: Held): void {
  if (open.get(id) !== held) {
    return;
  }

  const { forward, deps } = held;
  const args = deps.resolve(forward.serverId);

  if (!args) {
    open.delete(id);
    deps.memory?.release(forward.serverId, forward.remotePort);
    changed();

    return;
  }

  held.generation += 1;
  held.child = spawnFor(forward, args, deps);
  held.since = (deps.now ?? Date.now)();
  follow(id, held);

  const generation = held.generation;

  (deps.listening ?? awaitListening)(forward.localPort).then((up) => {
    if (up && open.get(id) === held && held.generation === generation) {
      held.forward = { ...held.forward, reconnecting: false };
      changed();
    }
  });
}

export async function openForward(
  serverId: unknown,
  remotePort: unknown,
  label: unknown,
  deps: ForwardDeps,
  options: ForwardOptions = {}
): Promise<AgentResponse<PortForward>> {
  if (typeof serverId !== "string") {
    return refuse("refusal.server.unknown");
  }

  const args = deps.resolve(serverId);

  if (!args) {
    return refuse("refusal.server.unknown");
  }

  if (
    typeof remotePort !== "number" ||
    !Number.isInteger(remotePort) ||
    remotePort < 1 ||
    remotePort > MAX_PORT
  ) {
    return refuse("refusal.port.range");
  }

  const already = existing(serverId, remotePort, options.localPort);

  if (already) {
    if (options.keep && !already.forward.kept) {
      keepForward(already.forward.id, true);
    }

    return { ok: true, result: already.forward };
  }

  if (
    options.localPort !== undefined &&
    !(await (deps.portFree ?? bindable)(options.localPort))
  ) {
    return refuse("refusal.forward.port.taken", { port: options.localPort });
  }

  const { localPort, movedFrom } = await localPortFor(
    serverId,
    remotePort,
    deps,
    options
  );

  if (localPort === null) {
    return refuse("refusal.forward.port.none");
  }

  counter += 1;

  const id = `f${counter.toString(36)}${Date.now().toString(36)}`;
  const forward: PortForward = {
    id,
    kept: options.keep === true,
    label: typeof label === "string" ? label : String(remotePort),
    localPort,
    remotePort,
    serverId,
    ...(movedFrom === undefined ? {} : { movedFrom }),
  };
  const held: Held = {
    child: spawnFor(forward, args, deps),
    deps,
    failures: 0,
    forward,
    generation: 0,
    since: (deps.now ?? Date.now)(),
  };

  open.set(id, held);
  follow(id, held);

  if (options.localPort === undefined) {
    deps.memory?.remember(serverId, remotePort, localPort);
  }

  if (forward.kept) {
    deps.memory?.keep(kept(forward));
  }

  changed();

  return { ok: true, result: forward };
}

/** At the app's start: a forward whose server is gone is let go, one whose port is taken waits for the next start. */
export async function reopenKeptForwards(deps: ForwardDeps): Promise<void> {
  for (const entry of deps.memory?.kept() ?? []) {
    if (!deps.resolve(entry.serverId)) {
      deps.memory?.release(entry.serverId, entry.remotePort);

      continue;
    }

    await openForward(entry.serverId, entry.remotePort, entry.label, deps, {
      keep: true,
      localPort: entry.localPort,
    });
  }
}
