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
  /** The dictionary entry and its values: without it, the screen shows the raw key. */
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
  /**
   * The value of a credential, off the generic event path on purpose: what
   * crosses `onEvent` reaches the renderer, and a secret must not.
   */
  onSecret?: (secret: SecretEvent) => void;
  /** Written on the line that follows the request, never in `params`, never kept. */
  secrets?: SecretPayload;
  /**
   * Called when the command cannot leave yet: a channel carries one command at
   * a time, and a screen owes the reader the difference between a machine that
   * is working and a request that has not been sent.
   */
  onQueued?: () => void;
  timeoutMs?: number;
  /**
   * The caller's way out of a command that holds the channel: a followed
   * journal ends when the reader leaves, not when the project stops. The
   * channel is cut so the agent stops too, and reopens on the next command.
   */
  signal?: AbortSignal;
  /**
   * A read made on a timer, not on a gesture: it rides the beat channel.
   *
   * The dashboard reads the machine every few seconds, and that read costs the
   * agent a good part of a second. On the channel the screens use, a folder
   * clicked during it would sit behind it — and the reader would take a poll
   * they never asked for as the slowness of their own click.
   */
  polled?: boolean;
  /**
   * The command rides the privileged channel whatever the contract says of it:
   * what proves the sudo password this computer is about to keep.
   */
  privileged?: boolean;
}

/**
 * Four channels per server that sudo opens without a password: a gesture must
 * wait neither behind an install nor behind the dashboard's beat, and an
 * install must not wait behind a journal the reader keeps open beside it. A
 * fifth, `privileged`, carries what the contract keeps for `pupitred serve
 * --privileged`, opened on demand with the sudo password and closed once idle.
 */
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
  /**
   * The app's language, told to the agent at `hello`.
   *
   * It holds for the session: a channel already open keeps the one it received,
   * and the next one leaves with the new one.
   */
  locale?: () => string;
  timeouts?: Partial<Record<CommandName, number>>;
  backoff?: { firstMs?: number; maxMs?: number; attempts?: number };
  /** The time a channel has to open, whatever command sits behind it. */
  connectMs?: number;
  gate?: UsageGate;
  /**
   * What the window is told about the link.
   *
   * A channel that drops and comes back is the ordinary life of an SSH session
   * over a laptop's wifi. A screen that says nothing about it leaves the reader
   * looking at a step that has stopped for no reason they can see.
   */
  onChannel?: (serverId: string, state: ChannelState) => void;
  /** How often the report is read back while the machine is still at work after a cut. */
  pollMs?: number;
  /**
   * How far the agent's clock may sit from this one before a report is taken
   * for another run's: `started_at` is the machine's own stamp.
   */
  skewMs?: number;
  /** The wall clock the agent's stamps are compared to; tests pin it. */
  now?: () => number;
  /**
   * Every result weighed against the contract, and a mismatch traced.
   *
   * On in development and under test, off in a packaged build: the call is
   * never failed for it, the screen shows what the agent said, and the trace
   * is what tells a developer the two sides disagree.
   */
  validateResults?: boolean;
  /**
   * The commands whose result becomes an argument of a local command or a
   * path — a pty's command line, a folder `rsync` writes under — weighed in
   * every build, and refused when they do not have the contract's shape.
   */
  enforcedResults?: ReadonlySet<CommandName>;
  /** How long the privileged channel stays open with nothing to carry. */
  idleMs?: number;
  /** Whether this computer holds the server's sudo password: what a refusal of sudo says. */
  sudoHeld?: (serverId: string) => boolean;
}

/**
 * Nothing is lost that was never held: a channel that never answered a hello
 * has failed to open, and that failure is the caller's error to show, with its
 * remedy — not a link the window announces as dropped.
 */

export type ChannelState = "open" | "lost";

/**
 * The most the agent may write without a line break before the channel is cut.
 *
 * A line is one envelope: a capture crosses as a base64 event, a report as one
 * answer, and neither comes near this. What does is a remote that is not the
 * agent at all — and the process must not swell along with it.
 */
const LINE_LIMIT = 4 * 1024 * 1024;

/**
 * Commands whose state survives the channel: the agent keeps working when the
 * link drops, and its own record is what tells us where it got to. `harden` is
 * not among them: the agent writes no report for it, and the install's would be
 * read in its place — who answers after the cut is what `harden-run.ts` asks.
 */
const RESUMABLE_COMMANDS: readonly CommandName[] = ["install", "upgrade"];

const DEFAULT_BACKOFF = { firstMs: 250, maxMs: 15_000, attempts: 4 };

const DEFAULT_POLL_MS = 3000;

/**
 * A minute, not ten: the agent writes its report once the configuration is
 * validated, so a report of the previous run stays on the machine for as long
 * as the new one takes to validate. The wider the window, the longer a finished
 * report of another run passes for this one.
 */
const DEFAULT_SKEW_MS = 60_000;

/**
 * A long command grants thirty minutes to its execution, never to its
 * connection: a channel that refuses to open has to say so, otherwise the
 * screen sits on its step announcing nothing.
 */
const CONNECT_MS = 30_000;

const STDERR_KEPT = 2000;

/**
 * How long a command may take, read from the contract rather than kept here.
 *
 * A screen says more than "still going": past half of it, it tells the reader
 * how long this is allowed to take, and at the end it offers to read the state
 * again rather than to keep waiting. Two sides needing the same number is what
 * makes it a contract.
 */
export function defaultTimeout(cmd: CommandName): number {
  return timeoutOf(cmd);
}

/**
 * A followed journal ends when the reader leaves, not when the agent is done:
 * it holds its channel for as long as a panel stays open. The service panel
 * shows the journal beside the configuration form, so the install that applies
 * the form cannot share a channel with it.
 */
const FOLLOW_CHANNEL_COMMANDS: readonly CommandName[] = [
  "project.logs",
  "service.logs",
];

/**
 * `shots.read` sits here rather than falling out of the timeout: it answers
 * quickly but holds the channel for the length of a file, and the dashboard's
 * own reads must not queue behind a gallery. `project.git_status` fetches from
 * the remote before it answers, and a repository on the other side of the world
 * takes seconds: the tabs of the project just opened must not wait for it.
 */
const WORK_CHANNEL_COMMANDS: readonly CommandName[] = [
  "shots.read",
  "fs.read",
  "project.git_status",
];

/** A command allowed more than a minute holds the channel long enough to need its own. */
const WORK_CHANNEL_MS = 60_000;

/**
 * A root session kept open is one a later gesture reuses without asking sudo
 * again; one kept forever is a root process for nobody.
 */
const PRIVILEGED_IDLE_MS = 60_000;

/**
 * What sudo writes before every read of the password. The first is expected;
 * the second means the first password was refused.
 */
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

/**
 * A command the agent never registered: sending it would only bring back
 * `unknown_command` in the agent's words, without the one thing the reader
 * can act on — which agent this app expects.
 */
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

/**
 * Whether a report can be this run's: one begun before the request went out
 * belongs to another, and so does one finished before it — a run cannot have
 * ended before it was asked for, whatever its steps say.
 */
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

/**
 * The steps of the report the channel never carried, handed on as events.
 *
 * id 0: the event is rebuilt from the report, not received on a channel. An
 * open `start` is a step the machine is on right now, and the screen shows it
 * so.
 */
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
  /** When the request left, on this side's clock: what the report's stamp is held against. */
  sentAt: number;
  /** The end of the time the command was granted, resumption included. */
  deadline: number;
  timeoutMs: number;
  delivered: Set<string>;
  onEvent?: (event: Event) => void;
  /** The cut itself, which stays the answer when the machine has no report of this run. */
  cut: AgentCallError;
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
  /** The command's own timeout, armed at once — or at the agent's first byte for a hello. */
  timer: ReturnType<typeof setTimeout> | null;
  /** Arms `timer` if it is not yet: a connection that says nothing is bounded by `cap`. */
  arm: () => void;
  cap: ReturnType<typeof setTimeout> | null;
  /** Lets go of the caller's abort signal once the command has settled. */
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
  /** How many commands hold or await this channel, this one included. */
  private waiting = 0;
  private failures = 0;
  private greeting: HelloResult | null = null;
  private refusal: AgentCallError | null = null;
  /** The window was told this channel is open, so it is owed the loss of it. */
  private announced = false;
  /** Whether the process now running has written anything on its output yet. */
  private sawOutput = false;
  /** sudo's prompts heard on this process, and the tail a prompt split across two chunks starts in. */
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

  /**
   * A channel the app closed does not come back: the command it cut is not
   * resumed, and the refusal stays so that nothing reopens it by mistake.
   */
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

  /**
   * The privileged channel is a root session: once nothing has used it for a
   * while it is let go, quietly — the link is fine, and the next gesture that
   * needs it opens it again.
   */
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

  /**
   * A second prompt is sudo refusing the password written on the first line,
   * and reading the hello sent after it as the next attempt. The channel does
   * not try the same password again: `resetPrivileged` is how a new one is
   * given a chance.
   */
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

  /**
   * What the agent did while the link was down, read back from its report until
   * that report says the run is over.
   *
   * The install did not stop with the connection: the agent writes its report
   * before every step, so the channel is reopened for as long as the command
   * itself was allowed, the steps never received are replayed, and the report
   * is read again until `finished_at` is set. A report stamped before the
   * request, or none at all, means the machine has no trace of this run — and
   * then the cut is the only true thing to say.
   */
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

  /**
   * The channel, reopened for as long as the command behind it may run: a
   * machine restarting its sshd or a laptop changing networks takes longer than
   * one connection window, and the install is still going.
   */
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
    // A request written to an ssh that has just died is an EPIPE on its stdin,
    // raised as an event: unheard, it takes the whole main process down.
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
    // `close`, not `exit`: the streams only drain afterward, and `ssh`'s own
    // complaint arrives after its death when that death is immediate.
    proc.on("close", () => this.drop(proc));

    // The handshake is timed from the agent's first byte, not from the spawn:
    // the seconds ssh spends connecting and authenticating are not the agent's
    // to answer in. The connection window bounds a remote that never speaks.
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

  /**
   * A server the configuration no longer knows does not come back: the channel
   * remembers that, rather than reopening on nothing every fifteen seconds.
   */
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

  /**
   * The process ended on its own. What its hello said no longer describes a
   * channel: `session()` must not answer from a link that is gone.
   */
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

  /**
   * The link cut from this side, with the window told when it had been told
   * of the opening: what the agent was writing is lost, and the next command
   * opens a fresh channel.
   */
  private sever(error: AgentCallError): void {
    this.settlePending(error);

    if (this.announced) {
      this.announced = false;
      this.options.onChannel(this.serverId, "lost");
    }

    this.destroy();
  }

  /**
   * The command in flight, given up by its caller.
   *
   * A channel carries one command at a time and the agent keeps writing until
   * it is done, so leaving the request pending would only hold the channel for
   * nobody: the process is cut, and the caller hears its own cancellation.
   */
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

      // The caller may have given up while the channel was opening: a request
      // written now would run on the agent for nobody, and hold the channel.
      if (options.signal?.aborted) {
        reject(cancelled(cmd));

        return;
      }

      const id = this.nextId;
      this.nextId += 1;

      // The agent answers one request at a time: a command left running on
      // it would hold every next one behind it. The session is cut, the agent
      // finishes on its own, and the next command opens a fresh one.
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
  /** Counted up at each close of a server's channels: what a cache keyed on a session compares itself to. */
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

  /**
   * What `hello` said about this server, or nothing if it never answered.
   *
   * Every channel greets the same agent, so the first one open speaks for the
   * server: the beat may well be up before a gesture has opened control.
   */
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

  entitlement(serverId: string): HelloResult["entitlement"] | null {
    return this.session(serverId)?.entitlement ?? null;
  }

  /**
   * How many times this server's channels were closed by the app.
   *
   * A closed channel is how the app moves to another binary, another account
   * or another machine: whatever was read over the previous sessions — a
   * catalogue, a list — belongs to them, and a holder of such a value keeps the
   * epoch it was read under to know when to read again.
   */
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

  /**
   * The privileged channel, let go so that the next gesture opens it with the
   * sudo password as it now stands: kept, entered or replaced on this computer.
   */
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
  /** The arguments that name the server: `-F <app config> <alias>`, or a host. */
  args: string[];
  /** The remote command, when the agent does not sit in the PATH. */
  serveCommand?: string;
  /** The sudo password, written on the first line and nowhere else: never an argument, never traced. */
  preamble?: string;
}

export const SERVE_COMMAND = "pupitred serve";

/**
 * The serve command for the account the channel logs in as.
 *
 * `pupitred serve` is a root process: it drops to the dev user for the commands
 * that belong to them and stays root for the rest — writing `/etc/pupitre`,
 * reading the server token and the entitlement cache, both `0600 root`, driving
 * systemd. Once hardening has closed root, the app logs in as `dev`, and a bare
 * `serve` there reads none of that and answers `entitlement_required` for every
 * command. sudo runs exactly this line for `dev` without a password once the
 * securing set one (decision 0015) — the limited session, which refuses what
 * the contract keeps for `--privileged` — so the channel asks for it; root
 * needs none and may not have sudo at all.
 */
export function serveAs(user: string): string {
  return user === "root" ? SERVE_COMMAND : `sudo -n ${SERVE_COMMAND}`;
}

const PRIVILEGED_SERVE = `${SERVE_COMMAND} --privileged`;

/**
 * The privileged session for the account the channel logs in as.
 *
 * sudo asks `dev` for its password to run anything but `pupitred serve` and
 * `pupitred binary install` exactly (decision 0015): the app writes the
 * password on the first line, and `sudo -S` reads it there, byte by byte,
 * leaving the protocol to pupitred. A server still under the rule of before
 * asks for no password, and the line would reach pupitred as a request: there,
 * the shell reads it first. The prompt is a marker: a second one on the error
 * stream is the password refused.
 */
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

/**
 * The channel as it opens on a real server: one `ssh`, one `pupitred serve`.
 *
 * Three descriptors and no more: `ssh` forwards nothing beyond 0, 1 and 2, so a
 * fourth one would never reach the agent — the secret line travels on standard
 * input like the requests it follows.
 *
 * A resolver that does not know the server says so, and the channel refuses:
 * falling back on another machine would run there what was meant for this one.
 */
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

    // Tighter than the 30 seconds `ssh-config.ts` writes for everything else:
    // this channel sits idle between requests, so a dead one is only noticed by
    // the keepalive, and a request would otherwise wait on a socket nobody holds.
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
