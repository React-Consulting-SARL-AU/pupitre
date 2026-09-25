import { createConnection, type Socket } from "node:net";
import type {
  AddressReach,
  ReachFailure,
  ServerReachFailed,
} from "@shared/servers";
import { trace } from "./trace";

const TIMEOUT_MS = 6000;
const MAX_PORT = 65_535;

const BANNER = /^SSH-\d+\.\d+-(\S+)/;

const PHRASES: Record<ReachFailure, string> = {
  "bad-host": "refusal.setup.host",
  "bad-port": "refusal.port.invalid",
  "bad-user": "refusal.setup.user",
  refused: "refusal.reach.refused",
  unreachable: "refusal.reach.unreachable",
  timeout: "refusal.reach.timeout",
  "not-ssh": "refusal.reach.wrongPort",
};

export function reachFailure(
  code: ReachFailure,
  values: Record<string, string | number>
): ServerReachFailed {
  return { code, phrase: { id: PHRASES[code], values }, reached: false };
}

function failed(code: ReachFailure, host: string, port: number): AddressReach {
  return reachFailure(code, { host, port });
}

function codeOf(error: NodeJS.ErrnoException): ReachFailure {
  if (error.code === "ECONNREFUSED") {
    return "refused";
  }

  return error.code === "ETIMEDOUT" ? "timeout" : "unreachable";
}

export type Dial = (host: string, port: number) => Socket;

/** An SSH server sends its banner first: reading it and hanging up needs no key and writes nothing. */
export function reachSsh(
  host: string,
  port: number,
  {
    dial = (h: string, p: number) => createConnection({ host: h, port: p }),
    timeoutMs = TIMEOUT_MS,
    now = () => Date.now(),
  }: { dial?: Dial; timeoutMs?: number; now?: () => number } = {}
): Promise<AddressReach> {
  if (!(Number.isInteger(port) && port > 0 && port <= MAX_PORT)) {
    return Promise.resolve(failed("bad-port", host, port));
  }

  return new Promise((resolve) => {
    const started = now();
    const socket = dial(host, port);

    let settled = false;
    let read = "";

    const answer = (reach: AddressReach) => {
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

      // An SSH server never says anything else first: a complete line that is no banner settles it.
      if (read.includes("\n")) {
        answer(failed("not-ssh", host, port));
      }
    });
  });
}
