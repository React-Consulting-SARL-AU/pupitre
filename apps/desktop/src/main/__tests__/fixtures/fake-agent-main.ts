import { existsSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import {
  RESTRICTED_COMMANDS as CONTRACT_RESTRICTED,
  requiresPrivilege,
} from "@pupitre/shared/agent-protocol";
import { LIMITED_FLAG, STATE_FLAG } from "./fake-agent-flags";

/**
 * The fake agent: it replays a transcript, and nothing else.
 *
 * It matches on the command and its parameters, never on the `id`, which it
 * echoes back — the client owns the numbering, and a transcript that pinned it
 * would break the moment a channel reconnects. What it does check is that the
 * `id` strictly grows, exactly as `pupitred` does: that is what an out-of-sync
 * client looks like from the other side.
 */

interface Exchange {
  cmd: string;
  params: Record<string, unknown>;
  secret: string | null;
  replies: string[];
  repeat: boolean;
  hang: boolean;
  die: boolean;
  enrol: boolean;
}

const ANY = "*";

const RESTRICTED = "restricted";

const ENTITLEMENT_DIRECTIVE = "@entitlement ";

/**
 * The commands a restricted server still answers.
 *
 * The list is `RESTRICTED_COMMANDS` of `@pupitre/shared/agent-protocol`, itself
 * the copy of `RestrictedCommands` in `apps/agent/internal/entitlement`:
 * `enroll` is in it because a re-enrolment is how a lost or revoked token is
 * repaired, and a transcript that forgot one would let the app test a repair
 * the real agent refuses.
 */
const RESTRICTED_COMMANDS = new Set<string>(CONTRACT_RESTRICTED);

/**
 * The host key this fake server declares. A transcript that enrols trades it
 * against a server token, exactly as `pupitred` does with the one on its disk.
 */
const HOST_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINPmg2sJ7wUW1eUeGGiuIYbYVWH8ihu5xMt/M39EO4Bd root@vps";

const OUT = 1;
const TRACE = 2;

interface Transcript {
  exchanges: Exchange[];
  /** `@entitlement restricted` on a line of its own, as the agent's own testdata writes it. */
  restricted: boolean;
}

function parse(path: string): Transcript {
  const exchanges: Exchange[] = [];
  const flags = { repeat: false, hang: false, die: false, enrol: false };
  let restricted = false;

  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trimEnd();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith(ENTITLEMENT_DIRECTIVE)) {
      restricted = line.slice(ENTITLEMENT_DIRECTIVE.length) === RESTRICTED;
      continue;
    }

    if (
      line === "@repeat" ||
      line === "@hang" ||
      line === "@die" ||
      line === "@enrol"
    ) {
      flags[line.slice(1) as keyof typeof flags] = true;
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
      flags.enrol = false;
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

  return { exchanges, restricted };
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

/**
 * What a restricted server answers to the commands it no longer opens, word for
 * word as `protocol.EntitlementRequired()` phrases it. It costs the transcript
 * nothing: the agent refuses before it dispatches, so the exchange the test is
 * waiting on is still the next one.
 */
function refuseEntitlement(id: number): void {
  say(
    JSON.stringify({
      id,
      ok: false,
      error: {
        code: "entitlement_required",
        message: "droit d'usage requis : ce serveur est en mode restreint",
        fix: "Ouvre https://app.pupitre.studio pour renouveler le droit d'usage de ce serveur.",
      },
    })
  );
}

/** The right an answer came back with, when it carries one. */
function entitlementOf(reply: Record<string, unknown>): string | null {
  const result = reply.result as { entitlement?: unknown } | undefined;

  return reply.ok === true && typeof result?.entitlement === "string"
    ? result.entitlement
    : null;
}

/**
 * Requests and secret lines arrive on the same standard input, so the reader
 * pulls one line at a time: a handler that expects a secret takes the line that
 * follows its request instead of letting it be read as the next request.
 */
const lines: string[] = [];
let waiting: ((line: string | null) => void) | null = null;
let ended = false;

function feed(line: string | null): void {
  if (waiting) {
    const resolve = waiting;
    waiting = null;
    resolve(line);

    return;
  }

  if (line === null) {
    ended = true;
  } else {
    lines.push(line);
  }
}

function nextLine(): Promise<string | null> {
  const ready = lines.shift();
  if (ready !== undefined) {
    return Promise.resolve(ready);
  }
  if (ended) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    waiting = resolve;
  });
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

/** `"*"` in a transcript stands for a value the test cannot know beforehand. */
function matches(expected: unknown, got: unknown): boolean {
  if (expected === ANY) {
    return true;
  }

  if (expected === null || typeof expected !== "object") {
    return expected === got;
  }

  if (Array.isArray(expected)) {
    return (
      Array.isArray(got) &&
      expected.length === got.length &&
      expected.every((value, index) => matches(value, got[index]))
    );
  }

  const wanted = expected as Record<string, unknown>;
  const seen = (got ?? {}) as Record<string, unknown>;

  return (
    got !== null &&
    typeof got === "object" &&
    Object.keys(wanted).length === Object.keys(seen).length &&
    Object.keys(wanted).every((key) => matches(wanted[key], seen[key]))
  );
}

function same(expected: Record<string, unknown>, got: unknown): boolean {
  return matches(stable(expected), stable(got ?? {}));
}

/**
 * The one thing this fake really does: trade the enrolment token it was handed
 * on the secret line against a server token, at the platform `params` names.
 *
 * It is what makes an enrolment test end to end rather than a transcript: the
 * token has to be the live one the platform granted, and the platform has to
 * burn it.
 */
async function trade(
  platformUrl: string,
  secret: string,
  version: string
): Promise<string | null> {
  const { enrollment_token } = JSON.parse(secret) as {
    enrollment_token: string;
  };

  const answer = await fetch(`${platformUrl}/agent/exchange`, {
    body: JSON.stringify({
      agent_version: version,
      arch: "amd64",
      enrollment_token,
      host_public_key: HOST_PUBLIC_KEY,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!answer.ok) {
    return null;
  }

  const { server_token } = (await answer.json()) as { server_token: string };

  return server_token || null;
}

/**
 * The usage right as the machine holds it: on disk, shared by every channel.
 * An enrolment on the privileged channel ends the restriction for the others
 * too, as `pupitred` resolves the right again for every command.
 */
function sharedRight(restricted: boolean): {
  refusing: () => boolean;
  set: (refusing: boolean) => void;
} {
  const path = process.argv
    .find((arg) => arg.startsWith(STATE_FLAG))
    ?.slice(STATE_FLAG.length);
  let local = restricted;

  if (path && restricted && !existsSync(path)) {
    writeFileSync(path, RESTRICTED);
  }

  return {
    refusing: () =>
      path && existsSync(path)
        ? readFileSync(path, "utf8") === RESTRICTED
        : local,
    set: (refusing) => {
      local = refusing;

      if (path) {
        writeFileSync(path, refusing ? RESTRICTED : "valid");
      }
    },
  };
}

function main(): void {
  const path = process.argv[2];
  // Every channel but the privileged one is `sudo -n pupitred serve`: the fake refuses there what the agent refuses.
  const limited = process.argv.includes(LIMITED_FLAG);
  const { exchanges, restricted } = parse(path);

  let cursor = 0;
  let lastId = -1;
  let buffer = "";
  let traded = "";
  const right = sharedRight(restricted);

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

    if (limited && requiresPrivilege(request.cmd, request.params)) {
      if (request.params?.secrets_stdin === true) {
        await nextLine();
      }

      fail(
        request.id,
        "privilege_required",
        `${request.cmd} n'est pas ouvert à une session sans le mot de passe sudo de dev`
      );

      return;
    }

    if (right.refusing() && !RESTRICTED_COMMANDS.has(request.cmd)) {
      refuseEntitlement(request.id);

      return;
    }

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

    let secret: string | null = null;

    if (exchange.secret !== null) {
      secret = await nextLine();
      if (exchange.secret !== ANY && secret !== exchange.secret) {
        fail(request.id, "bad_request", `flux secret inattendu : ${secret}`);

        return;
      }
    }

    if (exchange.enrol) {
      const platformUrl = String(
        (request.params as { platform_url?: unknown }).platform_url ?? ""
      );
      const serverToken = await trade(
        platformUrl,
        secret ?? "{}",
        "0.0.0-test"
      );

      if (!serverToken) {
        fail(request.id, "internal", "la plateforme a refusé le jeton");

        return;
      }

      traded = serverToken;
    }

    if (!exchange.repeat) {
      cursor += 1;
    }

    for (const reply of exchange.replies) {
      const value = JSON.parse(
        reply.replaceAll("$server_token", traded)
      ) as Record<string, unknown>;
      value.id = request.id;
      say(JSON.stringify(value));

      // An enrolment that came back with a right ends the restriction: the
      // agent resolves its entitlement again, and the seven commands become the
      // whole contract once more.
      const granted = exchange.cmd === "enroll" ? entitlementOf(value) : null;

      if (granted) {
        right.set(granted === RESTRICTED);
      }
    }

    if (exchange.die) {
      process.exit(1);
    }
  };

  const pump = async (): Promise<void> => {
    for (;;) {
      const line = await nextLine();
      if (line === null) {
        return;
      }

      await handle(line);
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
        feed(line);
      }
      cut = buffer.indexOf("\n");
    }
  });
  process.stdin.on("end", () => feed(null));

  pump().then(
    () => process.exit(0),
    () => process.exit(1)
  );
}

main();
