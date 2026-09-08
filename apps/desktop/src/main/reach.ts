import { createConnection, type Socket } from "node:net";
import type { ReachFailure, ServerReach } from "@shared/servers";
import { trace } from "./trace";

/**
 * Knocking on an address, before anything of ours is on the machine.
 *
 * An SSH server introduces itself first: it sends its banner as soon as the
 * connection is up, before a single byte is asked of the client. Reading that
 * line and hanging up says the three things worth knowing before adding a
 * server — the address resolves, something listens on that port, and what
 * listens speaks SSH — without a key, without a session, and without writing
 * anything on the machine.
 */

const TIMEOUT_MS = 6000;
const MAX_PORT = 65_535;

const BANNER = /^SSH-\d+\.\d+-(\S+)/;

const PHRASES: Record<ReachFailure, string> = {
  "bad-port": "refusal.port.invalid",
  refused: "refusal.reach.refused",
  unreachable: "refusal.reach.unreachable",
  timeout: "refusal.reach.timeout",
  "not-ssh": "refusal.reach.wrongPort",
};

function failed(code: ReachFailure, host: string, port: number): ServerReach {
  return {
    reached: false,
    code,
    phrase: { id: PHRASES[code], values: { host, port } },
  };
}

/** Node names every network refusal; these are the ones an address earns. */
function codeOf(error: NodeJS.ErrnoException): ReachFailure {
  if (error.code === "ECONNREFUSED") {
    return "refused";
  }

  return error.code === "ETIMEDOUT" ? "timeout" : "unreachable";
}

export type Dial = (host: string, port: number) => Socket;

export function reachSsh(
  host: string,
  port: number,
  {
    dial = (h: string, p: number) => createConnection({ host: h, port: p }),
    timeoutMs = TIMEOUT_MS,
    now = () => Date.now(),
  }: { dial?: Dial; timeoutMs?: number; now?: () => number } = {}
): Promise<ServerReach> {
  if (!(Number.isInteger(port) && port > 0 && port <= MAX_PORT)) {
    return Promise.resolve(failed("bad-port", host, port));
  }

  return new Promise((resolve) => {
    const started = now();
    const socket = dial(host, port);

    let settled = false;
    let read = "";

    const answer = (reach: ServerReach) => {
      if (settled) {
        return;
      }

      settled = true;
      trace("reach", reach.reached ? "answered" : reach.code, {
        host,
        port,
        ...(reach.reached ? { ms: reach.ms, software: reach.software } : {}),
      });
      socket.destroy();
      resolve(reach);
    };

    socket.setTimeout(timeoutMs, () => answer(failed("timeout", host, port)));
    socket.on("error", (error: NodeJS.ErrnoException) =>
      answer(failed(codeOf(error), host, port))
    );
    socket.on("close", () => answer(failed("not-ssh", host, port)));

    socket.on("data", (chunk: Buffer) => {
      read += chunk.toString("utf8");

      const line = read.split("\n", 1)[0];
      const banner = line.match(BANNER);

      if (banner) {
        answer({ ms: now() - started, reached: true, software: banner[1] });

        return;
      }

      // The line is complete and is not a banner: nothing longer will make it
      // one, and an SSH server never says anything else first.
      if (read.includes("\n")) {
        answer(failed("not-ssh", host, port));
      }
    });
  });
}
