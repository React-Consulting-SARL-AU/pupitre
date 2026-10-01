import { type ChildProcess, spawn as spawnChild } from "node:child_process";
import type { Writable } from "node:stream";
import {
  COMMANDS,
  type CommandName,
  type CommandParams,
  type CommandResult,
  requiresPrivilege,
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
import { timeoutOf } from "@pupitre/shared/agent-protocol/timeouts";
import type { AgentError, AgentResponse, ErrorPhrase } from "@shared/agent";
import { floorOf } from "@shared/agent-update";
import { refusalOf } from "./refusal";
import { trace } from "./trace";
import { mutates } from "./usage-guard";

export type { AgentError, AgentErrorCode, AgentResponse } from "@shared/agent";

/** Carries the agent's own words untouched: a remedy rewritten here would describe an imagined machine. */
export class AgentCallError extends Error {
  readonly code: AgentError["code"];
  readonly fix?: string;
  readonly remedy?: Remedy;
  readonly phrase?: ErrorPhrase;

  constructor(error: AgentError) {
    super(error.message);
    this.name = "AgentCallError";
    this.code = error.code;
    this.fix = error.fix;
    this.remedy = error.remedy;
    this.phrase = error.phrase;
  }

  toError(): AgentError {
    return {
      code: this.code,
      message: this.message,
      ...(this.fix ? { fix: this.fix } : {}),
      ...(this.remedy ? { remedy: this.remedy } : {}),
      ...(this.phrase ? { phrase: this.phrase } : {}),
    };
  }
}

export type SecretPayload = InstallSecrets | Record<string, string>;

export interface CallOptions {
  onEvent?: (event: Event) => void;
  /** Kept off `onEvent` on purpose: what crosses `onEvent` reaches the renderer, and a secret must not. */
  onSecret?: (secret: SecretEvent) => void;
  /** Written on the line that follows the request, never in `params`, never kept. */
  secrets?: SecretPayload;
  onQueued?: () => void;
  timeoutMs?: number;
  /** Cuts the channel so the agent stops too; it reopens on the next command. */
  signal?: AbortSignal;
  /** Timer reads ride the beat channel so a click never queues behind a poll the reader did not ask for. */
  polled?: boolean;
  /** Forces the privileged channel: used to prove the sudo password this computer is about to keep. */
  privileged?: boolean;
}

/** Separate channels so a gesture never waits behind an install, the beat, or a followed journal. */
export type ChannelPurpose =
  | "control"
  | "work"
  | "beat"
  | "follow"
  | "privileged";

const PURPOSES: readonly ChannelPurpose[] = [
  "control",
  "beat",
  "work",
  "follow",
  "privileged",
];

export type AgentSpawn = (context: {
  serverId: string;
  purpose: ChannelPurpose;
}) => ChildProcess;

/** A client built without a gate lets everything through: only the app's own client is bound to an account. */
export type UsageGate = () => AgentError | null;

export interface AgentClientOptions {
  spawn: AgentSpawn;
  appVersion?: string;
  /** Sent at `hello`: an open channel keeps the locale it received, the next one leaves with the new one. */
  locale?: () => string;
  timeouts?: Partial<Record<CommandName, number>>;
  backoff?: { firstMs?: number; maxMs?: number; attempts?: number };
  connectMs?: number;
  gate?: UsageGate;
  onChannel?: (serverId: string, state: ChannelState) => void;
  pollMs?: number;
  /** `started_at` is the agent's own clock, so a report is matched to this run within this tolerance. */
  skewMs?: number;
  now?: () => number;
  /** Traces contract mismatches without failing the call; off in a packaged build. */
  validateResults?: boolean;
  /** Results that become a local command argument or path, refused in every build when off-contract. */
  enforcedResults?: ReadonlySet<CommandName>;
  idleMs?: number;
  sudoHeld?: (serverId: string) => boolean;
}

export type ChannelState = "open" | "lost";

/** No envelope comes near this; a remote that is not the agent could, and the process must not swell with it. */
const LINE_LIMIT = 4 * 1024 * 1024;

/** `harden` writes no report, so resuming it would read the install's report in its place. */
const RESUMABLE_COMMANDS: readonly CommandName[] = ["install", "upgrade"];

const DEFAULT_BACKOFF = { firstMs: 250, maxMs: 15_000, attempts: 4 };

const DEFAULT_POLL_MS = 3000;

/** The previous run's report stays until the new config validates; a wider window lets it pass for this run. */
const DEFAULT_SKEW_MS = 60_000;

/** Long commands get thirty minutes to run, never to connect: a refused channel must surface quickly. */
const CONNECT_MS = 30_000;

const STDERR_KEPT = 2000;

export function defaultTimeout(cmd: CommandName): number {
  return timeoutOf(cmd);
}

/** A followed journal holds its channel while the panel is open, beside the form whose install must not wait. */
const FOLLOW_CHANNEL_COMMANDS: readonly CommandName[] = [
  "project.logs",
  "service.logs",
];

/** Quick to answer but channel-holding: a file transfer, or a git fetch from a far remote. */
const WORK_CHANNEL_COMMANDS: readonly CommandName[] = [
  "shots.read",
  "fs.read",
  "project.git_status",
];

const WORK_CHANNEL_MS = 60_000;

/** Kept open so a later gesture reuses root without asking sudo again, but never forever. */
const PRIVILEGED_IDLE_MS = 60_000;

/** sudo prints this before each password read: a second one means the first password was refused. */
export const SUDO_PROMPT = "pupitre-sudo:";

function purposeOf(
  cmd: CommandName,
  params: unknown,
  options: CallOptions
): ChannelPurpose {
  if (options.privileged === true || requiresPrivilege(cmd, params)) {
    return "privileged";
  }

  if (options.polled === true) {
    return "beat";
  }

  if (FOLLOW_CHANNEL_COMMANDS.includes(cmd)) {
    return "follow";
  }

  return timeoutOf(cmd) > WORK_CHANNEL_MS || WORK_CHANNEL_COMMANDS.includes(cmd)
    ? "work"
    : "control";
}

function left(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function disconnected(detail: string): AgentCallError {
  return new AgentCallError({
    ...(detail
      ? refusalOf("disconnected", "refusal.agent.dropped.detail", { detail })
      : refusalOf("disconnected", "refusal.agent.dropped")),
  });
}

function timedOut(cmd: CommandName, timeoutMs: number): AgentCallError {
  return new AgentCallError({
    ...refusalOf("timeout", "refusal.command.timeout", {
      cmd,
      seconds: Math.round(timeoutMs / 1000),
    }),
  });
}

function unopened(): AgentCallError {
  return new AgentCallError(
    refusalOf("disconnected", "refusal.channel.unopened")
  );
}

function cancelled(cmd: CommandName): AgentCallError {
  return new AgentCallError(
    refusalOf("cancelled", "refusal.command.cancelled", { cmd })
  );
}

function flooded(): AgentCallError {
  return new AgentCallError(
    refusalOf("disconnected", "refusal.channel.flooded", {
      limit: LINE_LIMIT / (1024 * 1024),
    })
  );
}

/** Refused locally so the reader learns which agent version this app expects. */
function unsupported(
  cmd: CommandName,
  greeting: HelloResult,
  appVersion: string
): AgentCallError {
  return new AgentCallError(
    refusalOf("unknown_command", "refusal.capability.missing", {
      agent: greeting.agent_version,
      cmd,
      floor: floorOf(appVersion) ?? appVersion,
    })
  );
}

function stampedAfter(stamp: string, since: number): boolean {
  const at = Date.parse(stamp);

  return Number.isNaN(at) || at >= since;
}

/** A report begun or finished before the request went out belongs to another run. */
export function reportOfRun(
  report: InstallReport,
  sentAt: number,
  skewMs: number
): boolean {
  const since = sentAt - skewMs;

  return (
    stampedAfter(report.started_at, since) &&
    (!report.finished_at || stampedAfter(report.finished_at, since))
  );
}

/** id 0 marks an event rebuilt from the report rather than received on a channel. */
function replaySteps(
  report: InstallReport,
  delivered: Set<string>,
  onEvent: ((event: Event) => void) | undefined
): void {
  for (const module of report.modules) {
    for (const step of module.steps) {
      const event: Event = {
        id: 0,
        event: "step",
        module: module.id,
        step: step.step,
        status: step.status,
        ms: step.ms,
        ...(step.replay ? { replay: step.replay } : {}),
        ...(step.message ? { message: step.message } : {}),
      };
      const key = stepKey(event);

      if (key && !delivered.has(key)) {
        delivered.add(key);
        onEvent?.(event);
      }
    }
  }
}

interface Resumption {
  cmd: CommandName;
  sentAt: number;
  deadline: number;
  timeoutMs: number;
  delivered: Set<string>;
  onEvent?: (event: Event) => void;
  cut: AgentCallError;
}

/** Requests are serialised per channel, so the next line is unambiguously this request's secrets. */
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

/** A `secret` event goes only to its caller, never down the path the IPC bridge listens on. */
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
  /** Armed at once, or at the agent's first byte for a hello; a silent connection is bounded by `cap`. */
  timer: ReturnType<typeof setTimeout> | null;
  arm: () => void;
  cap: ReturnType<typeof setTimeout> | null;
  release: () => void;
}

interface SendOptions {
  onEvent?: (event: Event) => void;
  onSecret?: (secret: SecretEvent) => void;
  timeoutMs: number;
  /** `timeoutMs` counts from the agent's first byte, and `capMs` from the request. */
  armOnOutput?: { capMs: number };
  signal?: AbortSignal;
}

type ResolvedOptions = Required<Omit<AgentClientOptions, "timeouts">> & {
  timeouts: Partial<Record<CommandName, number>>;
  backoff: Required<NonNullable<AgentClientOptions["backoff"]>>;
};

function settled(pending: Pending): void {
  if (pending.timer) {
    clearTimeout(pending.timer);
  }

  if (pending.cap) {
    clearTimeout(pending.cap);
  }

  pending.release();
}

/** `id` keeps growing across reconnections so a late answer from a previous session is never taken for this one. */
class AgentChannel {
  private proc: ChildProcess | null = null;
  private buffer = "";
  private stderr = "";
  private pending: Pending | null = null;
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private failures = 0;
  private greeting: HelloResult | null = null;
  private refusal: AgentCallError | null = null;
  private announced = false;
  private sawOutput = false;
  /** `promptTail` catches a sudo prompt split across two chunks. */
  private prompts = 0;
  private promptTail = "";
  private idle: ReturnType<typeof setTimeout> | null = null;

  readonly serverId: string;
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
    if (this.waiting > 0) {
      trace("agent", "queued", {
        channel: this.purpose,
        cmd,
        server: this.serverId,
      });
      call.onQueued?.();
    }

    this.waiting += 1;
    this.stayAwake();

    const next = this.queue.then(() => this.exchange(cmd, params, call));
    const done = () => {
      this.waiting -= 1;

      if (this.waiting === 0) {
        this.restLater();
      }
    };

    this.queue = next.then(done, done);

    return next;
  }

  /** The refusal stays so nothing reopens a channel the app closed, nor resumes the command it cut. */
  close(): void {
    const closed = new AgentCallError(
      refusalOf("disconnected", "refusal.channel.closed")
    );

    this.stayAwake();
    this.settlePending(closed);
    this.destroy();
    this.refusal = closed;
  }

  private stayAwake(): void {
    if (this.idle) {
      clearTimeout(this.idle);
      this.idle = null;
    }
  }

  /** An idle root session is closed quietly, without announcing a lost link; the next gesture reopens it. */
  private restLater(): void {
    if (this.purpose !== "privileged") {
      return;
    }

    this.stayAwake();
    this.idle = setTimeout(() => {
      this.idle = null;

      if (this.waiting === 0) {
        trace("agent", "rest", {
          channel: this.purpose,
          server: this.serverId,
        });
        this.announced = false;
        this.destroy();
      }
    }, this.options.idleMs);
    this.idle.unref?.();
  }

  /** A second prompt means sudo refused the password and would read the hello as the next attempt. */
  private hear(chunk: string): void {
    const heard = this.promptTail + chunk;

    this.prompts += heard.split(SUDO_PROMPT).length - 1;
    this.promptTail = heard.slice(-(SUDO_PROMPT.length - 1));

    if (this.prompts < 2 || this.refusal) {
      return;
    }

    const refused = new AgentCallError(
      refusalOf(
        "privilege_required",
        this.options.sudoHeld(this.serverId)
          ? "refusal.sudo.refused"
          : "refusal.sudo.absent"
      )
    );

    this.refusal = refused;
    this.sever(refused);
  }

  private async exchange<C extends CommandName>(
    cmd: C,
    params: CommandParams<C> | undefined,
    call: CallOptions
  ): Promise<CommandResult<C>> {
    if (call.signal?.aborted) {
      throw cancelled(cmd);
    }

    await this.ensure();

    const greeting = this.greeting;
    const capabilities = greeting?.capabilities;

    if (
      greeting &&
      Array.isArray(capabilities) &&
      capabilities.length > 0 &&
      !capabilities.includes(cmd)
    ) {
      throw unsupported(cmd, greeting, this.options.appVersion);
    }

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

    const started = Date.now();
    const sentAt = this.options.now();

    trace("agent", cmd, { channel: this.purpose, server: this.serverId });

    try {
      const result = await this.send(cmd, params, call.secrets, {
        onEvent,
        onSecret: call.onSecret,
        signal: call.signal,
        timeoutMs,
      });

      trace("agent", `${cmd}.done`, { ms: Date.now() - started });

      const fits =
        this.options.validateResults || this.options.enforcedResults.has(cmd)
          ? this.weigh(cmd, result)
          : true;

      if (!fits && this.options.enforcedResults.has(cmd)) {
        throw new AgentCallError(
          refusalOf("internal", "refusal.agent.shape", { cmd })
        );
      }

      return result as CommandResult<C>;
    } catch (error) {
      trace("agent", `${cmd}.failed`, {
        ms: Date.now() - started,
        why: error instanceof Error ? error.message : String(error),
      });

      const cut =
        error instanceof AgentCallError && error.code === "disconnected";

      if (cut && RESUMABLE_COMMANDS.includes(cmd)) {
        return (await this.resume({
          cmd,
          cut: error as AgentCallError,
          deadline: started + timeoutMs,
          delivered,
          onEvent: call.onEvent,
          sentAt,
          timeoutMs,
        })) as CommandResult<C>;
      }

      throw error;
    }
  }

  /** The agent keeps working through a cut and writes its report before every step, so it is polled to the end. */
  private async resume(resumption: Resumption): Promise<InstallResult> {
    const { cmd, cut, deadline, delivered, onEvent, sentAt } = resumption;

    for (;;) {
      await this.reconnect(deadline);

      const report = await this.report().catch(
        (error: AgentCallError) => error
      );

      if (report instanceof AgentCallError) {
        if (report.code === "disconnected") {
          continue;
        }

        throw cut;
      }

      if (!reportOfRun(report, sentAt, this.options.skewMs)) {
        throw cut;
      }

      replaySteps(report, delivered, onEvent);

      if (report.finished_at) {
        trace("agent", `${cmd}.resumed`, { server: this.serverId });

        return {
          failed: report.failed,
          warned: report.warned,
          report_path: report.report_path,
        };
      }

      if (left(deadline) === 0) {
        throw timedOut(cmd, resumption.timeoutMs);
      }

      trace("agent", `${cmd}.following`, { server: this.serverId });
      await delay(Math.min(this.options.pollMs, left(deadline)));
    }
  }

  /** Retried until the command's deadline: an sshd restart or a network change outlasts one connection window. */
  private async reconnect(deadline: number): Promise<void> {
    for (;;) {
      try {
        await this.ensure();

        return;
      } catch (error) {
        if (this.refusal || left(deadline) === 0) {
          throw error;
        }

        await delay(Math.min(this.options.backoff.maxMs, left(deadline)));
      }
    }
  }

  private report(): Promise<InstallReport> {
    return this.send("report", undefined, undefined, {
      timeoutMs: this.options.timeouts.report ?? timeoutOf("report"),
    }) as Promise<InstallReport>;
  }

  /** A result the contract does not describe is traced, and handed on as it came. */
  private weigh(cmd: CommandName, result: unknown): boolean {
    const shape = COMMANDS[cmd].result.safeParse(result);

    if (shape.success) {
      return true;
    }

    trace("agent", `${cmd}.shape`, {
      channel: this.purpose,
      issues: shape.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
      ),
      server: this.serverId,
    });

    return false;
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

    const deadline = Date.now() + this.options.connectMs;

    for (let attempt = 0; ; attempt += 1) {
      if (this.failures > 0) {
        await delay(Math.min(this.backoffMs(), left(deadline)));
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

        if (
          attempt + 1 >= this.options.backoff.attempts ||
          left(deadline) === 0
        ) {
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
    trace("agent", "connect", {
      channel: this.purpose,
      server: this.serverId,
    });

    const proc = this.open();

    this.proc = proc;
    this.buffer = "";
    this.stderr = "";
    this.sawOutput = false;
    this.prompts = 0;
    this.promptTail = "";

    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => this.read(chunk));
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_KEPT);
      trace("agent", "stderr", { channel: this.purpose, line: chunk.trim() });

      if (this.purpose === "privileged") {
        this.hear(chunk);
      }
    });
    // Writing to an ssh that just died raises EPIPE as an event: unheard, it takes the main process down.
    proc.stdin?.on("error", (error: Error) => {
      trace("agent", "stdin", { channel: this.purpose, why: error.message });
      this.settlePending(disconnected(error.message));
    });
    proc.on("error", () => this.drop(proc));
    proc.on("exit", (code: number | null) => {
      trace("agent", "exit", {
        channel: this.purpose,
        code,
        server: this.serverId,
      });
    });
    // `close`, not `exit`: the streams drain afterward, and an immediate ssh failure speaks after it dies.
    proc.on("close", () => this.drop(proc));

    // Timed from the agent's first byte: ssh's connect and auth time is not the agent's to answer in.
    try {
      this.greeting = (await this.send(
        "hello",
        {
          app_version: this.options.appVersion,
          locale: this.options.locale(),
          protocol: PROTOCOL_VERSION,
        },
        undefined,
        {
          armOnOutput: { capMs: this.options.connectMs },
          timeoutMs: this.options.timeouts.hello ?? timeoutOf("hello"),
        }
      )) as HelloResult;

      this.announced = true;
      this.options.onChannel(this.serverId, "open");

      trace("agent", "hello", {
        agent: this.greeting.agent_version,
        channel: this.purpose,
        server: this.serverId,
      });
    } catch (error) {
      if (
        error instanceof AgentCallError &&
        (error.code === "protocol_mismatch" ||
          error.code === "hello_required" ||
          error.code === "privilege_required")
      ) {
        this.refusal = error;
      }

      throw error;
    }
  }

  /** A server removed from the configuration is remembered as refused, not retried every fifteen seconds. */
  private open(): ChildProcess {
    try {
      return this.options.spawn({
        serverId: this.serverId,
        purpose: this.purpose,
      });
    } catch (error) {
      if (error instanceof AgentCallError) {
        this.refusal = error;
      }

      throw error;
    }
  }

  /** The greeting is dropped too: `session()` must not answer from a link that is gone. */
  private drop(proc: ChildProcess): void {
    if (this.proc !== proc) {
      return;
    }

    this.proc = null;
    this.greeting = null;

    if (this.announced) {
      this.announced = false;
      this.options.onChannel(this.serverId, "lost");
    }

    this.settlePending(
      disconnected(this.stderr.trim().split("\n").at(-1) ?? "")
    );
  }

  private destroy(): void {
    const proc = this.proc;

    this.proc = null;
    this.greeting = null;
    this.announced = false;
    proc?.kill();
  }

  private settlePending(error: AgentCallError): void {
    const pending = this.pending;

    if (!pending) {
      return;
    }

    this.pending = null;
    settled(pending);
    pending.reject(error);
  }

  private sever(error: AgentCallError): void {
    this.settlePending(error);

    if (this.announced) {
      this.announced = false;
      this.options.onChannel(this.serverId, "lost");
    }

    this.destroy();
  }

  /** The agent writes until done, so an abandoned request would hold the channel for nobody: cut the process. */
  private cancel(id: number, cmd: CommandName): void {
    if (this.pending?.id !== id) {
      return;
    }

    trace("agent", `${cmd}.cancelled`, {
      channel: this.purpose,
      server: this.serverId,
    });
    this.settlePending(cancelled(cmd));
    this.destroy();
  }

  private send(
    cmd: CommandName,
    params: unknown,
    secrets: SecretPayload | undefined,
    options: SendOptions
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const proc = this.proc;
      const stdin = proc?.stdin;

      if (!(proc && stdin)) {
        reject(unopened());

        return;
      }

      // The caller may have given up while the channel was opening.
      if (options.signal?.aborted) {
        reject(cancelled(cmd));

        return;
      }

      const id = this.nextId;

      this.nextId += 1;

      // A command left running would hold every next one: the session is cut and the agent finishes alone.
      const expire = () => {
        if (this.pending?.id !== id) {
          return;
        }

        trace("agent", `${cmd}.expired`, {
          channel: this.purpose,
          server: this.serverId,
        });
        this.sever(timedOut(cmd, options.timeoutMs));
      };

      const onAbort = () => this.cancel(id, cmd);
      const signal = options.signal;

      const pending: Pending = {
        id,
        onEvent: options.onEvent,
        onSecret: options.onSecret,
        reject,
        resolve,
        timer: options.armOnOutput
          ? null
          : setTimeout(expire, options.timeoutMs),
        arm: () => {
          pending.timer ??= setTimeout(expire, options.timeoutMs);
        },
        cap: options.armOnOutput
          ? setTimeout(expire, options.armOnOutput.capMs)
          : null,
        release: () => signal?.removeEventListener("abort", onAbort),
      };

      this.pending = pending;
      signal?.addEventListener("abort", onAbort, { once: true });

      if (this.sawOutput) {
        pending.arm();
      }

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
    if (!this.sawOutput) {
      this.sawOutput = true;
      this.pending?.arm();
    }

    this.buffer += chunk;

    let cut = this.buffer.indexOf("\n");

    while (cut !== -1) {
      const line = this.buffer.slice(0, cut);

      this.buffer = this.buffer.slice(cut + 1);
      this.take(line);
      cut = this.buffer.indexOf("\n");
    }

    if (this.buffer.length > LINE_LIMIT) {
      trace("agent", "flooded", {
        bytes: this.buffer.length,
        channel: this.purpose,
        server: this.serverId,
      });
      this.buffer = "";
      this.sever(flooded());
    }
  }

  /** A login banner, motd or ssh warning shares the stream: non-envelope lines are dropped, not errors. */
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

    // Another id belongs to an abandoned command: taking it would answer the next one with its result.
    if (!(response.success && pending && pending.id === response.data.id)) {
      return;
    }

    this.pending = null;
    settled(pending);

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
  /** Bumped at each close of a server's channels, so a session-keyed cache can tell it is stale. */
  private readonly epochs = new Map<string, number>();
  private readonly options: ResolvedOptions;

  constructor(options: AgentClientOptions) {
    this.options = {
      spawn: options.spawn,
      appVersion: options.appVersion ?? "0.1.0",
      locale: options.locale ?? (() => "en"),
      timeouts: options.timeouts ?? {},
      backoff: { ...DEFAULT_BACKOFF, ...options.backoff },
      connectMs: options.connectMs ?? CONNECT_MS,
      gate: options.gate ?? (() => null),
      onChannel: options.onChannel ?? (() => undefined),
      pollMs: options.pollMs ?? DEFAULT_POLL_MS,
      skewMs: options.skewMs ?? DEFAULT_SKEW_MS,
      now: options.now ?? Date.now,
      validateResults: options.validateResults ?? false,
      enforcedResults: options.enforcedResults ?? new Set(),
      idleMs: options.idleMs ?? PRIVILEGED_IDLE_MS,
      sudoHeld: options.sudoHeld ?? (() => true),
    };
  }

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

  stream<C extends CommandName>(
    serverId: string,
    cmd: C,
    params: CommandParams<C>,
    onEvent: (event: Event) => void,
    options: Omit<CallOptions, "onEvent"> = {}
  ): Promise<CommandResult<C>> {
    return this.run(serverId, cmd, params, { ...options, onEvent });
  }

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

  /** Any open channel greets the same agent: the beat may be up before a gesture opened control. */
  session(serverId: string): HelloResult | null {
    for (const purpose of PURPOSES) {
      const greeting = this.channels.get(`${serverId}:${purpose}`)?.hello;

      if (greeting) {
        return greeting;
      }
    }

    return null;
  }

  capabilities(serverId: string): readonly string[] {
    return this.session(serverId)?.capabilities ?? [];
  }

  /** Closing is how the app moves to another binary, account or machine: values read before are stale. */
  epoch(serverId: string): number {
    return this.epochs.get(serverId) ?? 0;
  }

  close(serverId: string): void {
    for (const purpose of PURPOSES) {
      const key = `${serverId}:${purpose}`;

      this.channels.get(key)?.close();
      this.channels.delete(key);
    }

    this.epochs.set(serverId, this.epoch(serverId) + 1);
  }

  /** The next gesture reopens it with the sudo password as it now stands on this computer. */
  resetPrivileged(serverId: string): void {
    const key = `${serverId}:privileged`;

    this.channels.get(key)?.close();
    this.channels.delete(key);
  }

  closeAll(): void {
    const closed = new Set<string>();

    for (const channel of this.channels.values()) {
      channel.close();
      closed.add(channel.serverId);
    }

    this.channels.clear();

    for (const serverId of closed) {
      this.epochs.set(serverId, this.epoch(serverId) + 1);
    }
  }

  /** The only door to the agent: the usage gate sits here so any future channel is gated too. */
  private run<C extends CommandName>(
    serverId: string,
    cmd: C,
    params: CommandParams<C> | undefined,
    options: CallOptions
  ): Promise<CommandResult<C>> {
    const refused = mutates(cmd) ? this.options.gate() : null;

    return refused
      ? Promise.reject(new AgentCallError(refused))
      : this.channel(serverId, purposeOf(cmd, params, options)).run(
          cmd,
          params,
          options
        );
  }

  private channel(serverId: string, purpose: ChannelPurpose): AgentChannel {
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
  args: string[];
  serveCommand?: string;
  /** The sudo password, written on the first line and nowhere else: never an argument, never traced. */
  preamble?: string;
}

export const SERVE_COMMAND = "pupitred serve";

/** serve must run as root to read the 0600 token and licence cache; `dev` gets it through passwordless sudo. */
export function serveAs(user: string): string {
  return user === "root" ? SERVE_COMMAND : `sudo -n ${SERVE_COMMAND}`;
}

const PRIVILEGED_SERVE = `${SERVE_COMMAND} --privileged`;

/** On a server with passwordless sudo the shell swallows the password line so it never reaches pupitred. */
export function privilegedServeAs(user: string): string {
  if (user === "root") {
    return PRIVILEGED_SERVE;
  }

  return [
    `if sudo -n true 2>/dev/null; then IFS= read -r p; exec sudo -n ${PRIVILEGED_SERVE}; fi`,
    `exec sudo -S -p '${SUDO_PROMPT}' ${PRIVILEGED_SERVE}`,
  ].join("; ");
}

export type SshLaunch = (
  command: string,
  args: string[],
  options: { stdio: ["pipe", "pipe", "pipe"] }
) => ChildProcess;

/** ssh forwards only fds 0-2, so secrets ride stdin; an unknown server is refused, never guessed. */
export function sshSpawn(
  resolve: (serverId: string, purpose: ChannelPurpose) => SshTarget | null,
  launch: SshLaunch = spawnChild
): AgentSpawn {
  return ({ serverId, purpose }) => {
    const target = resolve(serverId, purpose);

    if (!target) {
      throw new AgentCallError(
        refusalOf("bad_request", "refusal.server.unknown")
      );
    }

    // Tighter than ssh-config's 30 s: an idle channel's death is only noticed by the keepalive.
    const args = [
      "-o",
      "BatchMode=yes",
      "-o",
      "ServerAliveInterval=15",
      ...target.args,
      target.serveCommand ?? SERVE_COMMAND,
    ];

    trace("agent", "ssh", { args, server: serverId });

    const proc = launch("ssh", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (target.preamble !== undefined) {
      proc.stdin?.write(`${target.preamble}\n`);
    }

    return proc;
  };
}
