import { type ChildProcess, spawn as spawnChild } from "node:child_process";
import type { Writable } from "node:stream";
import type {
  CommandName,
  CommandParams,
  CommandResult,
} from "@pupitre/shared/agent-protocol";
import {
  type Event,
  EventSchema,
  PROTOCOL_VERSION,
  ResponseSchema,
} from "@pupitre/shared/agent-protocol/envelope";
import type { Remedy } from "@pupitre/shared/agent-protocol/errors";
import type {
  InstallReport,
  InstallResult,
  InstallSecrets,
} from "@pupitre/shared/agent-protocol/install";
import {
  type SecretEvent,
  SecretEventSchema,
} from "@pupitre/shared/agent-protocol/secrets";
import type { HelloResult } from "@pupitre/shared/agent-protocol/session";
import type { AgentError, AgentResponse } from "@shared/agent";
import { mutates } from "./usage-guard";

export type { AgentError, AgentErrorCode, AgentResponse } from "@shared/agent";

/**
 * An agent error, as an exception the renderer can render as it stands.
 *
 * `code`, `message`, `fix` and `remedy` are the agent's own words: nothing is
 * rewritten on the way, because a remedy written here would describe the
 * machine we imagine rather than the one that answered.
 */
export class AgentCallError extends Error {
  readonly code: AgentError["code"];
  readonly fix?: string;
  readonly remedy?: Remedy;

  constructor(error: AgentError) {
    super(error.message);
    this.name = "AgentCallError";
    this.code = error.code;
    this.fix = error.fix;
    this.remedy = error.remedy;
  }

  toError(): AgentError {
    return {
      code: this.code,
      message: this.message,
      ...(this.fix ? { fix: this.fix } : {}),
      ...(this.remedy ? { remedy: this.remedy } : {}),
    };
  }
}

export type SecretPayload = InstallSecrets | Record<string, string>;

export interface CallOptions {
  onEvent?: (event: Event) => void;
  /**
   * The value of a credential, off the generic event path on purpose: what
   * crosses `onEvent` reaches the renderer, and a secret must not.
   */
  onSecret?: (secret: SecretEvent) => void;
  /** Written on the line that follows the request, never in `params`, never kept. */
  secrets?: SecretPayload;
  timeoutMs?: number;
}

/**
 * Two channels per server: the state reads must not wait behind an install.
 */
export type ChannelPurpose = "control" | "work";

export type AgentSpawn = (context: {
  serverId: string;
  purpose: ChannelPurpose;
}) => ChildProcess;

/**
 * The usage right, asked before a command that acts leaves the app.
 *
 * It answers the refusal to hand back, or nothing. A client built without one
 * lets everything through: only the app's own client is bound to an account,
 * the ones that replay transcripts are not.
 */
export type UsageGate = () => AgentError | null;

export interface AgentClientOptions {
  spawn: AgentSpawn;
  appVersion?: string;
  timeouts?: Partial<Record<CommandName, number>>;
  backoff?: { firstMs?: number; maxMs?: number; attempts?: number };
  gate?: UsageGate;
}

const QUICK_MS = 10_000;
const STANDARD_MS = 60_000;
const LONG_MS = 1_800_000;

const QUICK_COMMANDS: readonly CommandName[] = [
  "hello",
  "ping",
  "snapshot",
  "status",
  "service.status",
  "completions",
  "project.list",
  "report",
  "secrets.status",
  "keys.list",
];

const LONG_COMMANDS: readonly CommandName[] = [
  "install",
  "uninstall",
  "upgrade",
  "harden",
  "agent.upgrade",
  "project.add",
  "project.detect",
  "project.install",
  "project.sync",
  "db.dump",
  "db.import",
];

/**
 * Commands whose state survives the channel: the agent keeps installing when the
 * link drops, and its report is what tells us where it got to.
 */
const RESUMABLE_COMMANDS: readonly CommandName[] = ["install", "upgrade"];

const DEFAULT_BACKOFF = { firstMs: 250, maxMs: 15_000, attempts: 4 };

const STDERR_KEPT = 2000;

export function defaultTimeout(cmd: CommandName): number {
  if (QUICK_COMMANDS.includes(cmd)) {
    return QUICK_MS;
  }

  return LONG_COMMANDS.includes(cmd) ? LONG_MS : STANDARD_MS;
}

/**
 * `shots.read` sits here rather than in `LONG_COMMANDS`: it answers quickly but
 * holds the channel for the length of a file, and the dashboard's own reads
 * must not queue behind a gallery.
 */
const WORK_CHANNEL_COMMANDS: readonly CommandName[] = [
  "project.logs",
  "shots.read",
];

function usesWorkChannel(cmd: CommandName): ChannelPurpose {
  return LONG_COMMANDS.includes(cmd) || WORK_CHANNEL_COMMANDS.includes(cmd)
    ? "work"
    : "control";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function disconnected(detail: string): AgentCallError {
  return new AgentCallError({
    code: "disconnected",
    message: detail
      ? `La connexion au serveur s'est interrompue : ${detail}`
      : "La connexion au serveur s'est interrompue.",
    fix: "Vérifie que le serveur répond, puis relance la commande.",
  });
}

/**
 * The secret line, written on the request's own stream and let go.
 *
 * Requests are serialised on a channel, so the line that follows a request
 * carrying `secrets_stdin` is unambiguously its secrets — and `params`, which
 * travels through logs and reports, never carries them.
 */
function writeSecrets(stdin: Writable, secrets: SecretPayload): void {
  stdin.write(`${JSON.stringify(secrets)}\n`);
}

function stepKey(event: Event): string | null {
  if (event.event !== "step") {
    return null;
  }
  const step = event as unknown as {
    module?: unknown;
    step?: unknown;
    status?: unknown;
  };

  return typeof step.module === "string" && typeof step.step === "string"
    ? `${step.module} ${step.step} ${String(step.status)}`
    : null;
}

/**
 * The line of the agent, handed to the caller that awaits it.
 *
 * A `secret` event leaves the stream here: it goes to the caller that asked for
 * that one value and to nothing else. Everything else — steps, logs, the bytes
 * of a capture — takes the ordinary path, the one the IPC bridge listens on.
 */
function deliver(pending: Pending, event: Event): void {
  if (event.event !== "secret") {
    pending.onEvent?.(event);

    return;
  }

  const secret = SecretEventSchema.safeParse(event);

  if (secret.success) {
    pending.onSecret?.(secret.data);
  }
}

interface Pending {
  id: number;
  onEvent?: (event: Event) => void;
  onSecret?: (secret: SecretEvent) => void;
  resolve: (value: unknown) => void;
  reject: (error: AgentCallError) => void;
  timer: ReturnType<typeof setTimeout>;
}

type ResolvedOptions = Required<Omit<AgentClientOptions, "timeouts">> & {
  timeouts: Partial<Record<CommandName, number>>;
  backoff: Required<NonNullable<AgentClientOptions["backoff"]>>;
};

/**
 * One SSH session running `pupitred serve`, and one command in flight.
 *
 * Two commands sharing a channel would read each other's answers, so they queue.
 * The `id` only ever grows — a reconnection continues the count rather than
 * starting over, so a late answer from the previous session can never be taken
 * for the answer of the current one.
 */
class AgentChannel {
  private proc: ChildProcess | null = null;
  private buffer = "";
  private stderr = "";
  private pending: Pending | null = null;
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();
  private failures = 0;
  private greeting: HelloResult | null = null;
  private refusal: AgentCallError | null = null;

  private readonly serverId: string;
  private readonly purpose: ChannelPurpose;
  private readonly options: ResolvedOptions;

  constructor(
    serverId: string,
    purpose: ChannelPurpose,
    options: ResolvedOptions
  ) {
    this.serverId = serverId;
    this.purpose = purpose;
    this.options = options;
  }

  get hello(): HelloResult | null {
    return this.greeting;
  }

  run<C extends CommandName>(
    cmd: C,
    params: CommandParams<C> | undefined,
    call: CallOptions
  ): Promise<CommandResult<C>> {
    const next = this.queue.then(() => this.exchange(cmd, params, call));
    this.queue = next.then(
      () => undefined,
      () => undefined
    );

    return next;
  }

  close(): void {
    this.settlePending(disconnected("le canal a été fermé"));
    this.destroy();
    this.greeting = null;
    this.refusal = null;
  }

  private async exchange<C extends CommandName>(
    cmd: C,
    params: CommandParams<C> | undefined,
    call: CallOptions
  ): Promise<CommandResult<C>> {
    await this.ensure();

    const delivered = new Set<string>();
    const onEvent = call.onEvent
      ? (event: Event) => {
          const key = stepKey(event);
          if (key) {
            delivered.add(key);
          }
          call.onEvent?.(event);
        }
      : undefined;

    const timeoutMs =
      call.timeoutMs ?? this.options.timeouts[cmd] ?? defaultTimeout(cmd);

    try {
      const result = await this.send(cmd, params, call.secrets, {
        onEvent,
        onSecret: call.onSecret,
        timeoutMs,
      });

      return result as CommandResult<C>;
    } catch (error) {
      const cut =
        error instanceof AgentCallError && error.code === "disconnected";

      if (cut && RESUMABLE_COMMANDS.includes(cmd)) {
        return (await this.resume(delivered, call.onEvent)) as CommandResult<C>;
      }

      throw error;
    }
  }

  /**
   * What the agent did while the link was down, read back from its report.
   *
   * The install did not stop with the connection; replaying the steps we never
   * received puts the screen back where the machine actually is, instead of
   * showing a progress bar frozen at the moment of the cut.
   */
  private async resume(
    delivered: Set<string>,
    onEvent: ((event: Event) => void) | undefined
  ): Promise<InstallResult> {
    await this.ensure();

    const report = (await this.send("report", undefined, undefined, {
      timeoutMs: this.options.timeouts.report ?? QUICK_MS,
    })) as InstallReport;

    for (const module of report.modules) {
      for (const step of module.steps) {
        // id 0: the event is rebuilt from the report, not received on a channel.
        const event: Event = {
          id: 0,
          event: "step",
          module: module.id,
          step: step.step,
          status: step.status,
          ms: step.ms,
          ...(step.replay ? { replay: step.replay } : {}),
        };
        const key = stepKey(event);

        if (key && !delivered.has(key)) {
          delivered.add(key);
          onEvent?.(event);
        }
      }
    }

    return {
      failed: report.failed,
      warned: report.warned,
      report_path: report.report_path,
    };
  }

  private alive(): boolean {
    return Boolean(this.proc && this.proc.exitCode === null);
  }

  private async ensure(): Promise<void> {
    if (this.refusal) {
      throw this.refusal;
    }
    if (this.alive()) {
      return;
    }

    for (let attempt = 0; ; attempt += 1) {
      if (this.failures > 0) {
        await delay(this.backoffMs());
      }

      try {
        await this.connect();
        this.failures = 0;

        return;
      } catch (error) {
        this.failures += 1;
        this.destroy();

        if (this.refusal) {
          throw this.refusal;
        }
        if (attempt + 1 >= this.options.backoff.attempts) {
          throw error;
        }
      }
    }
  }

  private backoffMs(): number {
    const { firstMs, maxMs } = this.options.backoff;

    return Math.min(firstMs * 2 ** (this.failures - 1), maxMs);
  }

  private async connect(): Promise<void> {
    const proc = this.options.spawn({
      serverId: this.serverId,
      purpose: this.purpose,
    });

    this.proc = proc;
    this.buffer = "";
    this.stderr = "";

    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => this.read(chunk));
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_KEPT);
    });
    proc.on("error", () => this.drop(proc));
    proc.on("exit", () => this.drop(proc));

    try {
      this.greeting = (await this.send(
        "hello",
        {
          app_version: this.options.appVersion,
          protocol: PROTOCOL_VERSION,
        },
        undefined,
        { timeoutMs: this.options.timeouts.hello ?? QUICK_MS }
      )) as HelloResult;
    } catch (error) {
      if (
        error instanceof AgentCallError &&
        (error.code === "protocol_mismatch" || error.code === "hello_required")
      ) {
        this.refusal = error;
      }

      throw error;
    }
  }

  private drop(proc: ChildProcess): void {
    if (this.proc !== proc) {
      return;
    }
    this.proc = null;
    this.settlePending(
      disconnected(this.stderr.trim().split("\n").at(-1) ?? "")
    );
  }

  private destroy(): void {
    const proc = this.proc;
    this.proc = null;
    proc?.kill();
  }

  private settlePending(error: AgentCallError): void {
    const pending = this.pending;
    if (!pending) {
      return;
    }
    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private send(
    cmd: CommandName,
    params: unknown,
    secrets: SecretPayload | undefined,
    options: {
      onEvent?: (event: Event) => void;
      onSecret?: (secret: SecretEvent) => void;
      timeoutMs: number;
    }
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const proc = this.proc;
      const stdin = proc?.stdin;

      if (!(proc && stdin)) {
        reject(disconnected("le canal n'est pas ouvert"));

        return;
      }

      const id = this.nextId;
      this.nextId += 1;

      const timer = setTimeout(() => {
        if (this.pending?.id !== id) {
          return;
        }
        this.pending = null;
        reject(
          new AgentCallError({
            code: "timeout",
            message: `La commande ${cmd} n'a pas répondu en ${Math.round(options.timeoutMs / 1000)} s.`,
            fix: "Relance la commande, ou ouvre un diagnostic avec doctor.",
          })
        );
      }, options.timeoutMs);

      this.pending = {
        id,
        onEvent: options.onEvent,
        onSecret: options.onSecret,
        reject,
        resolve,
        timer,
      };

      const request =
        params && Object.keys(params).length > 0
          ? { id, cmd, params }
          : { id, cmd };

      try {
        stdin.write(`${JSON.stringify(request)}\n`);
        if (secrets) {
          writeSecrets(stdin, secrets);
        }
      } catch (error) {
        this.settlePending(disconnected((error as Error).message));
      }
    });
  }

  private read(chunk: string): void {
    this.buffer += chunk;

    let cut = this.buffer.indexOf("\n");
    while (cut !== -1) {
      const line = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut + 1);
      this.take(line);
      cut = this.buffer.indexOf("\n");
    }
  }

  /**
   * One line of the agent, or one line of noise.
   *
   * A login banner, a `motd`, an ssh warning: all of it lands on the same
   * stream, and none of it is an answer. Anything that is not a protocol
   * envelope is dropped rather than turned into an error.
   */
  private take(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return;
    }

    const pending = this.pending;

    const event = EventSchema.safeParse(value);
    if (event.success) {
      if (pending?.id === event.data.id) {
        deliver(pending, event.data);
      }

      return;
    }

    const response = ResponseSchema.safeParse(value);
    // An answer whose id is not the one awaited belongs to a command we gave up
    // on: taking it would answer the next command with the previous one's result.
    if (!(response.success && pending && pending.id === response.data.id)) {
      return;
    }

    this.pending = null;
    clearTimeout(pending.timer);

    if (response.data.ok) {
      pending.resolve(response.data.result);
    } else {
      pending.reject(new AgentCallError(response.data.error));
    }
  }
}

type CallArgs<C extends CommandName> =
  Record<string, never> extends CommandParams<C>
    ? [params?: CommandParams<C>, options?: CallOptions]
    : [params: CommandParams<C>, options?: CallOptions];

export class AgentClient {
  private readonly channels = new Map<string, AgentChannel>();
  private readonly options: ResolvedOptions;

  constructor(options: AgentClientOptions) {
    this.options = {
      spawn: options.spawn,
      appVersion: options.appVersion ?? "0.1.0",
      timeouts: options.timeouts ?? {},
      backoff: { ...DEFAULT_BACKOFF, ...options.backoff },
      gate: options.gate ?? (() => null),
    };
  }

  /** The typed call. An agent error becomes an `AgentCallError`. */
  call<C extends CommandName>(
    serverId: string,
    cmd: C,
    ...rest: CallArgs<C>
  ): Promise<CommandResult<C>> {
    const [params, options] = rest as [
      CommandParams<C> | undefined,
      CallOptions | undefined,
    ];

    return this.run(serverId, cmd, params, options ?? {});
  }

  /** The same call, with the events of a long command as they arrive. */
  stream<C extends CommandName>(
    serverId: string,
    cmd: C,
    params: CommandParams<C>,
    onEvent: (event: Event) => void,
    options: Omit<CallOptions, "onEvent"> = {}
  ): Promise<CommandResult<C>> {
    return this.run(serverId, cmd, params, { ...options, onEvent });
  }

  /** The envelope, for what crosses IPC: it never throws. */
  async request<C extends CommandName>(
    serverId: string,
    cmd: C,
    params?: CommandParams<C>,
    options: CallOptions = {}
  ): Promise<AgentResponse<CommandResult<C>>> {
    try {
      const result = await this.run(serverId, cmd, params, options);

      return { ok: true, result };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof AgentCallError
            ? error.toError()
            : {
                code: "internal",
                message: (error as Error).message,
              },
      };
    }
  }

  /** What `hello` said about this server, or nothing if it never answered. */
  session(serverId: string): HelloResult | null {
    return this.channels.get(`${serverId}:control`)?.hello ?? null;
  }

  capabilities(serverId: string): readonly string[] {
    return this.session(serverId)?.capabilities ?? [];
  }

  entitlement(serverId: string): HelloResult["entitlement"] | null {
    return this.session(serverId)?.entitlement ?? null;
  }

  close(serverId: string): void {
    for (const purpose of ["control", "work"] as const) {
      const key = `${serverId}:${purpose}`;
      this.channels.get(key)?.close();
      this.channels.delete(key);
    }
  }

  closeAll(): void {
    for (const channel of this.channels.values()) {
      channel.close();
    }
    this.channels.clear();
  }

  /**
   * The one place a command becomes a request, and the only door to the agent.
   *
   * The usage right is asked here rather than on each channel: a channel added
   * tomorrow reaches the agent through this method and is refused by it without
   * anyone having thought about it. `READING_COMMANDS` being a whitelist, a
   * command added to the contract is held to act until it is declared readable.
   * A refusal stops nothing on the server — nothing is sent at all.
   */
  private run<C extends CommandName>(
    serverId: string,
    cmd: C,
    params: CommandParams<C> | undefined,
    options: CallOptions
  ): Promise<CommandResult<C>> {
    const refused = mutates(cmd) ? this.options.gate() : null;

    return refused
      ? Promise.reject(new AgentCallError(refused))
      : this.channel(serverId, cmd).run(cmd, params, options);
  }

  private channel(serverId: string, cmd: CommandName): AgentChannel {
    const purpose = usesWorkChannel(cmd);
    const key = `${serverId}:${purpose}`;
    const existing = this.channels.get(key);
    if (existing) {
      return existing;
    }

    const channel = new AgentChannel(serverId, purpose, this.options);
    this.channels.set(key, channel);

    return channel;
  }
}

export function createAgentClient(options: AgentClientOptions): AgentClient {
  return new AgentClient(options);
}

export interface SshTarget {
  /** The arguments that name the server: `-F <app config> <alias>`, or a host. */
  args: string[];
  /** The remote command, when the agent does not sit in the PATH. */
  serveCommand?: string;
}

/**
 * The channel as it opens on a real server: one `ssh`, one `pupitred serve`.
 *
 * Three descriptors and no more: `ssh` forwards nothing beyond 0, 1 and 2, so a
 * fourth one would never reach the agent — the secret line travels on standard
 * input like the requests it follows.
 */
export function sshSpawn(resolve: (serverId: string) => SshTarget): AgentSpawn {
  return ({ serverId }) => {
    const target = resolve(serverId);
    const args = [
      "-o",
      "BatchMode=yes",
      "-o",
      "ServerAliveInterval=15",
      ...target.args,
      target.serveCommand ?? "pupitred serve",
    ];

    return spawnChild("ssh", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
  };
}
