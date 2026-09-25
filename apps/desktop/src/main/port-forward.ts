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

export interface ForwardDeps {
  resolve: (serverId: string) => string[] | null;
  spawn?: (args: string[]) => ChildProcess;
  freePort?: () => Promise<number | null>;
  portFree?: (port: number) => Promise<boolean>;
  /** Reusing last time's local port keeps a desktop client's saved connection working. */
  memory?: ForwardMemory;
}

interface Held {
  forward: PortForward;
  child: ChildProcess;
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

export function forwards(serverId?: string): PortForward[] {
  return [...open.values()]
    .map((entry) => entry.forward)
    .filter((forward) => !serverId || forward.serverId === serverId);
}

export function closeForward(id: unknown): PortForward[] {
  if (typeof id !== "string") {
    return forwards();
  }

  const held = open.get(id);

  if (!held) {
    return forwards();
  }

  held.child.kill();
  open.delete(id);
  changed();

  return forwards();
}

export function closeForwards(serverId?: string): void {
  let dropped = false;

  for (const [id, entry] of open) {
    if (!serverId || entry.forward.serverId === serverId) {
      entry.child.kill();
      open.delete(id);
      dropped = true;
    }
  }

  if (dropped) {
    changed();
  }
}

function existing(
  serverId: string,
  remotePort: number,
  localPort?: number
): PortForward | null {
  return (
    forwards(serverId).find(
      (forward) =>
        forward.remotePort === remotePort &&
        (localPort === undefined || forward.localPort === localPort)
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
  imposed: number | undefined
): Promise<{ localPort: number | null; movedFrom?: number }> {
  if (imposed !== undefined) {
    return { localPort: imposed };
  }

  const recalled = deps.memory?.recall(serverId, remotePort) ?? null;

  if (recalled !== null && (await (deps.portFree ?? bindable)(recalled))) {
    return { localPort: recalled };
  }

  const borrowed = await (deps.freePort ?? borrowedPort)();

  return recalled === null
    ? { localPort: borrowed }
    : { localPort: borrowed, movedFrom: recalled };
}

/** `localPort` is imposed when needed: a sign-in that calls back `localhost:54545` only works on 54545. */
export async function openForward(
  serverId: unknown,
  remotePort: unknown,
  label: unknown,
  deps: ForwardDeps,
  options: { localPort?: number } = {}
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
    return { ok: true, result: already };
  }

  const { localPort, movedFrom } = await localPortFor(
    serverId,
    remotePort,
    deps,
    options.localPort
  );

  if (localPort === null) {
    return refuse("refusal.forward.port.none");
  }

  counter += 1;

  const id = `f${counter.toString(36)}${Date.now().toString(36)}`;
  const forward: PortForward = {
    id,
    label: typeof label === "string" ? label : String(remotePort),
    localPort,
    remotePort,
    serverId,
    ...(movedFrom === undefined ? {} : { movedFrom }),
  };

  // Through the master a forward would live in the master, and survive the kill.
  const child = (deps.spawn ?? sshForward)([
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
    `${localPort}:127.0.0.1:${remotePort}`,
    ...args,
  ]);

  open.set(id, { child, forward });
  child.on("exit", () => {
    if (open.delete(id)) {
      changed();
    }
  });

  if (options.localPort === undefined) {
    deps.memory?.remember(serverId, remotePort, localPort);
  }

  changed();

  return { ok: true, result: forward };
}
