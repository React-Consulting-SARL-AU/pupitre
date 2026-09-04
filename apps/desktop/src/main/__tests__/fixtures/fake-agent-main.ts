import { createReadStream, readFileSync, writeSync } from "node:fs";

/**
 * The fake agent: it replays an AGT-01 transcript, and nothing else.
 *
 * It matches on the command and its parameters, never on the `id`, which it
 * echoes back — the client owns the numbering, and a transcript that pinned it
 * would break the moment a channel reconnects. What it does check is that the
 * `id` strictly grows, exactly as `pupitred` does: that is what an out-of-sync
 * client looks like from the other side.
 */

type Exchange = {
  cmd: string;
  params: Record<string, unknown>;
  secret: string | null;
  replies: string[];
  repeat: boolean;
  hang: boolean;
  die: boolean;
};

const OUT = 1;
const TRACE = 2;
const SECRETS = 3;

function parse(path: string): Exchange[] {
  const exchanges: Exchange[] = [];
  const flags = { repeat: false, hang: false, die: false };

  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trimEnd();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    if (line === "@repeat" || line === "@hang" || line === "@die") {
      flags[line.slice(1) as "repeat" | "hang" | "die"] = true;
      continue;
    }

    const body = line.slice(2);

    if (line.startsWith("> ")) {
      const request = JSON.parse(body) as {
        cmd: string;
        params?: Record<string, unknown>;
      };
      exchanges.push({
        cmd: request.cmd,
        params: request.params ?? {},
        secret: null,
        replies: [],
        ...flags,
      });
      flags.repeat = false;
      flags.hang = false;
      flags.die = false;
      continue;
    }

    const current = exchanges.at(-1);
    if (!current) {
      throw new Error(`ligne sans requête : ${line}`);
    }

    if (line.startsWith("$ ")) {
      current.secret = body;
    } else if (line.startsWith("< ")) {
      current.replies.push(body);
    } else {
      throw new Error(`ligne inattendue : ${line}`);
    }
  }

  return exchanges;
}

function say(line: string): void {
  writeSync(OUT, `${line}\n`);
}

function trace(line: string): void {
  writeSync(TRACE, `${line}\n`);
}

function fail(id: number, code: string, message: string): void {
  say(JSON.stringify({ id, ok: false, error: { code, message } }));
}

const secrets: string[] = [];
const waiting: ((line: string) => void)[] = [];

function readSecrets(): void {
  let buffer = "";
  const stream = createReadStream("", { fd: SECRETS, autoClose: false });
  stream.setEncoding("utf8");
  stream.on("error", () => undefined);
  stream.on("data", (chunk) => {
    buffer += chunk;
    let cut = buffer.indexOf("\n");
    while (cut !== -1) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      const waiter = waiting.shift();
      if (waiter) {
        waiter(line);
      } else {
        secrets.push(line);
      }
      cut = buffer.indexOf("\n");
    }
  });
}

function nextSecret(): Promise<string> {
  const ready = secrets.shift();

  return ready === undefined
    ? new Promise((resolve) => waiting.push(resolve))
    : Promise.resolve(ready);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = stable((value as Record<string, unknown>)[key]);
  }

  return sorted;
}

function same(expected: Record<string, unknown>, got: unknown): boolean {
  return JSON.stringify(stable(expected)) === JSON.stringify(stable(got ?? {}));
}

function main(): void {
  const path = process.argv[2];
  const exchanges = parse(path);

  readSecrets();

  let cursor = 0;
  let lastId = -1;
  let buffer = "";
  let work: Promise<unknown> = Promise.resolve();

  const handle = async (line: string): Promise<void> => {
    const request = JSON.parse(line) as {
      id: number;
      cmd: string;
      params?: Record<string, unknown>;
    };

    trace(`id=${request.id} cmd=${request.cmd}`);

    if (request.id <= lastId) {
      fail(
        request.id,
        "bad_request",
        `id ${request.id} refusé : dernier id reçu ${lastId}`
      );

      return;
    }
    lastId = request.id;

    const exchange = exchanges[cursor];

    if (!exchange) {
      fail(request.id, "internal", `transcription épuisée sur ${request.cmd}`);

      return;
    }

    if (
      exchange.cmd !== request.cmd ||
      !same(exchange.params, request.params)
    ) {
      fail(
        request.id,
        "internal",
        `attendu ${exchange.cmd} ${JSON.stringify(exchange.params)}, reçu ${request.cmd} ${JSON.stringify(request.params ?? {})}`
      );

      return;
    }

    if (exchange.secret !== null) {
      const sent = await nextSecret();
      if (sent !== exchange.secret) {
        fail(request.id, "bad_request", `flux secret inattendu : ${sent}`);

        return;
      }
    }

    if (!exchange.repeat) {
      cursor += 1;
    }

    for (const reply of exchange.replies) {
      const value = JSON.parse(reply) as Record<string, unknown>;
      value.id = request.id;
      say(JSON.stringify(value));
    }

    if (exchange.die) {
      process.exit(1);
    }
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let cut = buffer.indexOf("\n");
    while (cut !== -1) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (line.length > 0) {
        work = work.then(() => handle(line));
      }
      cut = buffer.indexOf("\n");
    }
  });
  process.stdin.on("end", () => {
    work.then(
      () => process.exit(0),
      () => process.exit(1)
    );
  });
}

main();
