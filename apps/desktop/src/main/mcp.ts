import { execFile } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server as SocketServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  APP_MCP_INSTRUCTIONS,
  APP_MCP_NAME,
  APP_MCP_SOCKET,
  type LocalAgentsState,
  machineMcpName,
} from "@pupitre/shared/desktop-mcp";
import type { AgentResponse, ErrorPhrase } from "@shared/agent";
import { alias } from "@shared/ssh-names";
import { app, dialog } from "electron";
import { refusals } from "../renderer/src/i18n/strings/refusals";
import { account } from "./account";
import { agentClient, currentLanguage } from "./agent";
import { preferencesOf } from "./app-preferences";
import { appVersion } from "./app-version";
import { catalogOf, declaredManifests } from "./catalog";
import { type DialogKey, dialogTextIn } from "./dialogs";
import { HARNESSED } from "./harness";
import { checkDeps, installDeps } from "./install";
import { runCheck, runInstall } from "./install-run";
import { handle } from "./ipc";
import { isBoolean, shape } from "./ipc-guard";
import {
  appEntry,
  binaryDirs,
  type ClientOutcome,
  firstExecutable,
  type McpEntry,
  machineEntry,
  syncClients,
  type Wanted,
} from "./mcp-clients-run";
import { lineSession } from "./mcp-session";
import { appMcpTools, type McpMachine, type McpRequest } from "./mcp-tools-run";
import {
  awaitListening,
  closeForward,
  forwards,
  openForward,
} from "./port-forward";
import { projectDeps } from "./projects";
import {
  addProject,
  listProjects,
  onProject,
  updateProject,
} from "./projects-run";
import { home, onServersSaved, paths, read, sshNameOf } from "./servers";
import { forwardDeps } from "./services";
import { ensureLink } from "./ssh-config";
import { trace } from "./trace";
import { usageRefusal } from "./usage-guard";

/** The longest path a Unix socket binds to, on macOS and Linux. */
const SOCKET_PATH_LIMIT = 103;
const SOCKET_MODE = 0o600;
const CLI_TIMEOUT_MS = 30_000;
/** Past this the change is refused: a model waits on its call, and nobody may be at the computer. */
const CONFIRM_TIMEOUT_MS = 5 * 60_000;
const RESYNC_DELAY_MS = 500;

let listening: SocketServer | null = null;
let bound: string | null = null;
let resync: ReturnType<typeof setTimeout> | null = null;

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);

    return true;
  } catch {
    return false;
  }
}

function binary(name: string): string | null {
  return firstExecutable(
    name,
    binaryDirs(homedir(), process.env.PATH),
    executable
  );
}

function supported(): boolean {
  return (
    process.platform !== "win32" &&
    binary("nc") !== null &&
    socketPath() !== null
  );
}

/** The shorter of the link and the data folder: either can exceed what a socket path may hold. */
function socketPath(): string | null {
  const link = ensureLink(paths());
  const candidates = [link, paths().root]
    .filter((dir): dir is string => dir !== null)
    .map((dir) => join(dir, APP_MCP_SOCKET))
    .filter((path) => path.length <= SOCKET_PATH_LIMIT)
    .sort((a, b) => a.length - b.length);

  return candidates[0] ?? null;
}

/** Named through the space-free link when there is one, as the SSH config is. */
function shownPath(path: string): string {
  const link = ensureLink(paths());

  return link ? path.replace(paths().root, link) : path;
}

function claudeDesktopConfig(): string | null {
  const dir =
    process.platform === "darwin"
      ? join(home(), "Library", "Application Support", "Claude")
      : join(home(), ".config", "Claude");

  return existsSync(dir) ? join(dir, "claude_desktop_config.json") : null;
}

function run(file: string, args: string[]) {
  const env = {
    ...process.env,
    PATH: binaryDirs(homedir(), process.env.PATH).join(":"),
  };

  return new Promise<{ code: number | null; stdout: string }>((resolve) => {
    execFile(file, args, { env, timeout: CLI_TIMEOUT_MS }, (error, stdout) => {
      const code = error ? ((error as { code?: number }).code ?? 1) : 0;

      resolve({ code: typeof code === "number" ? code : 1, stdout });
    });
  });
}

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function machines(): McpMachine[] {
  return read().servers.map((server) => ({
    entry: machineMcpName(sshNameOf(server.id) ?? alias(server)),
    id: server.id,
    name: server.name,
  }));
}

function entries(): McpEntry[] {
  const ssh = binary("ssh");
  const nc = binary("nc");
  const socket = socketPath();
  const config = shownPath(paths().configPath);
  const laid = new Map<string, McpEntry>();

  if (nc && socket) {
    laid.set(APP_MCP_NAME, appEntry(nc, socket));
  }

  for (const server of ssh ? read().servers : []) {
    const entry = machineEntry(ssh as string, {
      config: server.origin === "app" ? config : null,
      host: alias(server),
      sshName: sshNameOf(server.id) ?? alias(server),
    });

    if (!laid.has(entry.name)) {
      laid.set(entry.name, entry);
    }
  }

  return [...laid.values()];
}

async function confirm(request: McpRequest): Promise<boolean> {
  if (HARNESSED) {
    return false;
  }

  const language = currentLanguage();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CONFIRM_TIMEOUT_MS);

  app.focus({ steal: true });

  try {
    const { response } = await dialog.showMessageBox({
      buttons: [
        dialogTextIn(language, "mcpRefuse"),
        dialogTextIn(language, "mcpAllow"),
      ],
      cancelId: 0,
      defaultId: 0,
      detail: request.detail,
      message: request.title,
      signal: abort.signal,
      type: "question",
    });

    return response === 1 && !abort.signal.aborted;
  } finally {
    clearTimeout(timer);
  }
}

const DICTIONARY: Record<string, string> = refusals.en;
const PLACEHOLDER = /\{(\w+)\}/g;

function filled(text: string, values: ErrorPhrase["values"] = {}): string {
  return text.replace(PLACEHOLDER, (_, name: string) =>
    String(values[name] ?? "")
  );
}

/** The model reads the contract's language, so the app's refusals reach it in English. */
function worded(phrase: ErrorPhrase): { message: string; fix?: string } | null {
  const message = DICTIONARY[phrase.id];
  const fix = DICTIONARY[`${phrase.id}.fix`];

  if (!message) {
    return null;
  }

  return fix
    ? {
        fix: filled(fix, phrase.values),
        message: filled(message, phrase.values),
      }
    : { message: filled(message, phrase.values) };
}

function guarded<T>(
  act: () => Promise<AgentResponse<T>>
): Promise<AgentResponse<T>> {
  const refused = usageRefusal(() => account.guard());

  return refused ? Promise.resolve(refused) : act();
}

async function secretFields(serverId: string, modules: readonly string[]) {
  const manifests = await declaredManifests(serverId);

  if (!manifests.ok) {
    return manifests;
  }

  const fields = Object.fromEntries(
    manifests.result
      .filter((manifest) => modules.includes(manifest.id))
      .map((manifest) => [
        manifest.id,
        manifest.fields
          .filter(
            (field) =>
              field.kind === "secret" ||
              (field.kind === "list" && field.items === "secret")
          )
          .map((field) => field.key),
      ])
  );

  return { ok: true as const, result: fields };
}

const tools = appMcpTools({
  addProject: (serverId, params) =>
    guarded(() => addProject(serverId, params, projectDeps)),
  catalog: catalogOf,
  check: (serverId, modules, config) =>
    runCheck(serverId, modules, config, checkDeps()),
  closeForward,
  confirm,
  detect: (serverId, params) =>
    agentClient.request(serverId, "project.detect", params),
  install: (serverId, modules, config) =>
    guarded(() =>
      runInstall(serverId, modules, config, () => undefined, installDeps())
    ),
  forwards: () => forwards(),
  listening: (port) => awaitListening(port),
  machines,
  openForward: (serverId, port, opening, label) =>
    openForward(serverId, port, label, forwardDeps, opening),
  projects: (serverId) => listProjects(serverId, projectDeps),
  removeProject: (serverId, name) =>
    guarded(() => onProject("project.remove", serverId, name, projectDeps)),
  secretFields,
  uninstall: (serverId, modules) =>
    guarded(() =>
      agentClient.request(serverId, "uninstall", { modules: [...modules] })
    ),
  say: (key: DialogKey, values?: Record<string, string>) =>
    dialogTextIn(currentLanguage(), key, values),
  unattended: () => preferencesOf().read().localAgentsUnattended,
  updateProject: (serverId, params) =>
    guarded(() => updateProject(serverId, params, projectDeps)),
  worded,
});

const server = {
  instructions: APP_MCP_INSTRUCTIONS,
  name: APP_MCP_NAME,
  tools: () => tools,
  version: appVersion(),
};

/** A socket left by an app that died is removed: nothing else binds this path. */
function listen(): void {
  const path = socketPath();

  if (listening || !path) {
    return;
  }

  rmSync(path, { force: true });
  bound = path;

  listening = createServer((socket) => {
    socket.setEncoding("utf8");

    const session = lineSession(server, (line) => {
      if (!socket.destroyed) {
        socket.write(line);
      }
    });

    socket.on("data", (chunk: string) => session.feed(chunk));
    socket.on("error", () => socket.destroy());
  });

  listening.on("error", (error) => {
    trace("mcp", "listen-failed", { error: (error as Error).message });
  });
  listening.listen(path, () => chmodSync(path, SOCKET_MODE));
}

function close(): void {
  listening?.close();
  listening = null;

  if (bound) {
    rmSync(bound, { force: true });
    bound = null;
  }
}

function sync(wanted: Wanted): Promise<ClientOutcome[]> {
  return syncClients(wanted, {
    claudeCli: HARNESSED ? null : binary("claude"),
    claudeCodeConfig: join(home(), ".claude.json"),
    claudeDesktopConfig: claudeDesktopConfig(),
    codexCli: HARNESSED ? null : binary("codex"),
    readFile: readOrNull,
    run,
    writeFile: (path, content) => writeFileSync(path, content),
  });
}

/** The clients are read again each time: the owner may have changed them by hand meanwhile. */
async function state(clients?: ClientOutcome[]): Promise<LocalAgentsState> {
  const preferences = preferencesOf().read();

  return {
    clients: clients ?? (await sync(null)),
    enabled: preferences.localAgents,
    machines: machines().map((machine) => ({
      entry: machine.entry,
      serverName: machine.name,
    })),
    supported: supported(),
    unattended: preferences.localAgentsUnattended,
  };
}

async function setEnabled(enabled: boolean): Promise<LocalAgentsState> {
  if (enabled && !supported()) {
    return state();
  }

  preferencesOf().set({ localAgents: enabled });

  if (enabled) {
    listen();
  } else {
    close();
  }

  return state(await sync(enabled ? entries() : []));
}

function setUnattended(unattended: boolean): Promise<LocalAgentsState> {
  preferencesOf().set({ localAgentsUnattended: unattended });

  return state();
}

export function registerLocalAgents(): void {
  handle("local-agents:state", shape(), () => state());
  handle("local-agents:set", shape(isBoolean), (_e, enabled) =>
    setEnabled(enabled)
  );
  handle("local-agents:unattended", shape(isBoolean), (_e, unattended) =>
    setUnattended(unattended)
  );

  onServersSaved(() => {
    if (resync) {
      clearTimeout(resync);
    }

    resync = setTimeout(() => {
      resync = null;

      if (preferencesOf().read().localAgents) {
        syncQuietly();
      }
    }, RESYNC_DELAY_MS);
  });

  if (preferencesOf().read().localAgents && supported()) {
    listen();
    syncQuietly();
  }
}

function syncQuietly(): void {
  sync(entries()).catch((error: unknown) =>
    trace("mcp", "sync-failed", { error: (error as Error).message })
  );
}

export function localAgentsListening(): boolean {
  return listening !== null;
}

export function closeLocalAgents(): void {
  if (listening) {
    close();
  }
}
