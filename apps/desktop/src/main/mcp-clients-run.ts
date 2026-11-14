import {
  APP_MCP_NAME,
  isPupitreMcpName,
  type McpClient,
  type McpClientState,
  machineMcpName,
  SERVER_MCP_COMMAND,
} from "@pupitre/shared/desktop-mcp";

export interface McpEntry {
  name: string;
  command: string;
  args: string[];
}

/** An app opened from the Finder gets a bare PATH: the places installers use are looked at too. */
export function binaryDirs(home: string, path: string | undefined): string[] {
  const usual = [
    `${home}/.local/bin`,
    `${home}/.claude/local`,
    `${home}/.bun/bin`,
    `${home}/.npm-global/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];

  return [...new Set([...usual, ...(path ?? "").split(":").filter(Boolean)])];
}

export function firstExecutable(
  name: string,
  dirs: readonly string[],
  executable: (path: string) => boolean
): string | null {
  return (
    dirs.map((dir) => `${dir}/${name}`).find((path) => executable(path)) ?? null
  );
}

export function appEntry(nc: string, socket: string): McpEntry {
  return { args: ["-U", socket], command: nc, name: APP_MCP_NAME };
}

export interface EntryMachine {
  sshName: string;
  /** The app's SSH config, absent for a host of the user's own `~/.ssh/config`. */
  config: string | null;
  /** The name `ssh` resolves: the app's alias, or the system host. */
  host: string;
}

/** BatchMode: a key that needs a passphrase fails at once instead of waiting on a prompt nobody sees. */
export function machineEntry(ssh: string, machine: EntryMachine): McpEntry {
  return {
    args: [
      ...(machine.config ? ["-F", machine.config] : []),
      "-o",
      "BatchMode=yes",
      machine.host,
      SERVER_MCP_COMMAND,
      "mcp",
    ],
    command: ssh,
    name: machineMcpName(machine.sshName),
  };
}

export interface CliRun {
  code: number | null;
  stdout: string;
}

export interface McpClientDeps {
  /** Null when the client is not installed on this computer. */
  claudeCli: string | null;
  codexCli: string | null;
  /** Null when Claude Desktop is not installed. */
  claudeDesktopConfig: string | null;
  claudeCodeConfig: string;
  run: (file: string, args: string[]) => Promise<CliRun>;
  readFile: (path: string) => string | null;
  writeFile: (path: string, content: string) => void;
}

export type ClientOutcome = McpClientState;

/** Null reads the clients without changing them. */
export type Wanted = readonly McpEntry[] | null;

type Held = Map<string, McpEntry>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Only the entries Pupitre may own: a client's other servers are never read further. */
function heldFrom(servers: unknown, transportOf = (raw: unknown) => raw): Held {
  const held: Held = new Map();

  if (!isRecord(servers)) {
    return held;
  }

  for (const [name, raw] of Object.entries(servers)) {
    const entry = transportOf(raw);

    if (isPupitreMcpName(name) && isRecord(entry)) {
      held.set(name, {
        args: stringsOf(entry.args),
        command: typeof entry.command === "string" ? entry.command : "",
        name,
      });
    }
  }

  return held;
}

function same(a: McpEntry, b: McpEntry): boolean {
  return (
    a.command === b.command &&
    a.args.length === b.args.length &&
    a.args.every((arg, index) => arg === b.args[index])
  );
}

export interface Plan {
  remove: string[];
  add: McpEntry[];
}

/** A changed entry is taken out then laid again: no client CLI rewrites one in place. */
export function plan(held: Held, wanted: readonly McpEntry[]): Plan {
  const wantedByName = new Map(wanted.map((entry) => [entry.name, entry]));
  const remove = [...held.values()]
    .filter((entry) => {
      const kept = wantedByName.get(entry.name);

      return !(kept && same(kept, entry));
    })
    .map((entry) => entry.name);
  const add = wanted.filter((entry) => {
    const was = held.get(entry.name);

    return !(was && same(was, entry));
  });

  return { add, remove };
}

function parsed(content: string | null): Record<string, unknown> | null {
  if (content === null) {
    return {};
  }

  try {
    const value: unknown = JSON.parse(content);

    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

async function throughCli(
  cli: string,
  held: Held,
  wanted: readonly McpEntry[],
  removeArgs: (name: string) => string[],
  addArgs: (entry: McpEntry) => string[],
  run: McpClientDeps["run"]
): Promise<string | undefined> {
  const { add, remove } = plan(held, wanted);

  for (const name of remove) {
    const done = await run(cli, removeArgs(name));

    if (done.code !== 0) {
      return `${name}: remove exited ${done.code}`;
    }
  }

  for (const entry of add) {
    const done = await run(cli, addArgs(entry));

    if (done.code !== 0) {
      return `${entry.name}: add exited ${done.code}`;
    }
  }

  return;
}

function outcome(
  id: McpClient,
  held: Held | null,
  problem?: string
): ClientOutcome {
  const declared = held ? [...held.keys()].sort() : [];

  return problem
    ? { declared, found: true, id, problem }
    : { declared, found: true, id };
}

function claudeCodeHeld(deps: McpClientDeps): Held | null {
  const document = parsed(deps.readFile(deps.claudeCodeConfig));

  return document ? heldFrom(document.mcpServers) : null;
}

async function claudeCode(
  wanted: Wanted,
  deps: McpClientDeps
): Promise<ClientOutcome> {
  if (!deps.claudeCli) {
    return { declared: [], found: false, id: "claude-code" };
  }

  const held = claudeCodeHeld(deps);

  if (!held) {
    return outcome(
      "claude-code",
      null,
      `${deps.claudeCodeConfig} does not parse`
    );
  }

  if (!wanted) {
    return outcome("claude-code", held);
  }

  const problem = await throughCli(
    deps.claudeCli,
    held,
    wanted,
    (name) => ["mcp", "remove", "--scope", "user", name],
    (entry) => [
      "mcp",
      "add",
      "--scope",
      "user",
      entry.name,
      "--",
      entry.command,
      ...entry.args,
    ],
    deps.run
  );

  return outcome("claude-code", claudeCodeHeld(deps), problem);
}

function codexServers(listing: string): unknown {
  const value: unknown = JSON.parse(listing);

  if (!Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    value
      .filter(
        (item): item is { name: string; transport: unknown } =>
          isRecord(item) && typeof item.name === "string"
      )
      .map((item) => [item.name, item.transport])
  );
}

async function codexHeld(
  cli: string,
  deps: McpClientDeps
): Promise<Held | null> {
  const listing = await deps.run(cli, ["mcp", "list", "--json"]);

  try {
    return heldFrom(codexServers(listing.stdout));
  } catch {
    return null;
  }
}

async function codex(
  wanted: Wanted,
  deps: McpClientDeps
): Promise<ClientOutcome> {
  const cli = deps.codexCli;

  if (!cli) {
    return { declared: [], found: false, id: "codex" };
  }

  const held = await codexHeld(cli, deps);

  if (!held) {
    return outcome("codex", null, "codex mcp list --json does not parse");
  }

  if (!wanted) {
    return outcome("codex", held);
  }

  const problem = await throughCli(
    cli,
    held,
    wanted,
    (name) => ["mcp", "remove", name],
    (entry) => ["mcp", "add", entry.name, "--", entry.command, ...entry.args],
    deps.run
  );

  return outcome("codex", await codexHeld(cli, deps), problem);
}

/** No CLI here: the file is read, only `pupitre*` entries change, and every other key is written back as read. */
function claudeDesktop(wanted: Wanted, deps: McpClientDeps): ClientOutcome {
  const path = deps.claudeDesktopConfig;

  if (!path) {
    return { declared: [], found: false, id: "claude-desktop" };
  }

  const document = parsed(deps.readFile(path));

  if (!document) {
    return outcome("claude-desktop", null, `${path} does not parse`);
  }

  const servers = isRecord(document.mcpServers) ? document.mcpServers : {};
  const held = heldFrom(servers);

  if (!wanted) {
    return outcome("claude-desktop", held);
  }

  const { add, remove } = plan(held, wanted);

  if (add.length === 0 && remove.length === 0) {
    return outcome("claude-desktop", held);
  }

  const kept = Object.fromEntries(
    Object.entries(servers).filter(([name]) => !remove.includes(name))
  );
  const laid = Object.fromEntries(
    add.map((entry) => [
      entry.name,
      { args: entry.args, command: entry.command },
    ])
  );
  const written = { ...kept, ...laid };

  deps.writeFile(
    path,
    `${JSON.stringify({ ...document, mcpServers: written }, null, 2)}\n`
  );

  return outcome("claude-desktop", heldFrom(written));
}

/** Every client found gets exactly `wanted` among its `pupitre*` entries; an empty list takes them all out. */
export async function syncClients(
  wanted: Wanted,
  deps: McpClientDeps
): Promise<ClientOutcome[]> {
  return [
    await claudeCode(wanted, deps),
    claudeDesktop(wanted, deps),
    await codex(wanted, deps),
  ];
}
