import type { ChildProcess } from "node:child_process";
import { spawn as spawnChild } from "node:child_process";
import { createServer } from "node:net";
import type { AgentResponse } from "@shared/agent";
import type { PortForward } from "@shared/services";

/**
 * A port of the server, brought to this computer by `ssh -L`.
 *
 * Nothing new listens on the server: the database stays bound to its loopback,
 * and the forward is the app's own process, on this side, for as long as the
 * reader keeps it open. It is the one way a desktop client reaches a service
 * that the whole architecture forbids exposing.
 */

const MAX_PORT = 65_535;

export interface ForwardDeps {
  /** The `ssh` arguments that name a server, or nothing if it is unknown. */
  resolve: (serverId: string) => string[] | null;
  spawn?: (args: string[]) => ChildProcess;
  freePort?: () => Promise<number>;
}

interface Held {
  forward: PortForward;
  child: ChildProcess;
}

const open = new Map<string, Held>();

let counter = 0;

function refuse(message: string, fix: string): AgentResponse<never> {
  return { ok: false, error: { code: "bad_request", fix, message } };
}

/**
 * A local port nobody holds, asked of the system rather than guessed: binding
 * on 0 and letting go is the only way to be told one that is actually free.
 */
function borrowedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();

    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();

      probe.close(() =>
        address && typeof address === "object"
          ? resolve(address.port)
          : reject(new Error("aucun port libre"))
      );
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

  open.get(id)?.child.kill();
  open.delete(id);

  return forwards();
}

export function closeForwards(serverId?: string): void {
  for (const [id, entry] of open) {
    if (!serverId || entry.forward.serverId === serverId) {
      entry.child.kill();
      open.delete(id);
    }
  }
}

/** The one already open on that port, so a second click reuses it. */
function existing(serverId: string, remotePort: number): PortForward | null {
  return (
    forwards(serverId).find((forward) => forward.remotePort === remotePort) ??
    null
  );
}

export async function openForward(
  serverId: unknown,
  remotePort: unknown,
  label: unknown,
  deps: ForwardDeps
): Promise<AgentResponse<PortForward>> {
  if (typeof serverId !== "string") {
    return refuse(
      "Ce serveur n'est plus dans la liste.",
      "Choisis un serveur dans les réglages."
    );
  }

  const args = deps.resolve(serverId);

  if (!args) {
    return refuse(
      "Ce serveur n'est plus dans la liste.",
      "Choisis un serveur dans les réglages."
    );
  }

  if (
    typeof remotePort !== "number" ||
    !Number.isInteger(remotePort) ||
    remotePort < 1 ||
    remotePort > MAX_PORT
  ) {
    return refuse(
      "Ce port n'existe pas.",
      "Un port va de 1 à 65535 ; celui du service est dans sa fiche."
    );
  }

  const already = existing(serverId, remotePort);

  if (already) {
    return { ok: true, result: already };
  }

  const localPort = await (deps.freePort ?? borrowedPort)();

  counter += 1;

  const id = `f${counter.toString(36)}${Date.now().toString(36)}`;
  const forward: PortForward = {
    id,
    label: typeof label === "string" ? label : String(remotePort),
    localPort,
    remotePort,
    serverId,
  };

  const child = (deps.spawn ?? sshForward)([
    "-o",
    "BatchMode=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-N",
    "-L",
    `${localPort}:127.0.0.1:${remotePort}`,
    ...args,
  ]);

  open.set(id, { child, forward });
  child.on("exit", () => open.delete(id));

  return { ok: true, result: forward };
}
