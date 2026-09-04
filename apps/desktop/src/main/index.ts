import { join } from "node:path";
import { DARK, LIGHT } from "@pupitre/design/tokens";
import type { AgentResponse } from "@shared/agent";
import type {
  Action,
  ActionResult,
  Branches,
  Capabilities,
  FileDiff,
  GitStatus,
  ProcessInfo,
  Registration,
  Secret,
  ServersConfig,
  Session,
  Snapshot,
  TerminalAgent,
  TerminalKind,
  WorkingTree,
} from "@shared/contract";
import { editorUrl, logPath } from "@shared/profile";
import type {
  HostKeyDecision,
  ServerAdded,
  ServerDraft,
} from "@shared/servers";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from "electron";
import { agentClient, registerAgentChannels } from "./agent";
import { registerCatalog } from "./catalog";
import { catalog, history, paths } from "./completion";
import { fileDiff, inspect, pull, validPath, workingTree } from "./git";
import { registerInspection } from "./inspection";
import { registerInstall } from "./install";
import { SetupError } from "./server-setup";
import {
  activate as activateServer,
  add as addServer,
  hostKey,
  profile,
  publicKey,
  read,
  remove as removeServer,
  rename as renameServer,
  sshHosts,
  trustReinstalled,
  write as writeConfig,
} from "./servers";
import {
  activeHost,
  channel,
  command,
  diagnose,
  followLog,
  installerPresent,
  runInstaller,
  sendLine,
  sendSecret,
} from "./ssh";
import {
  close,
  closeAll,
  open,
  resize,
  setRoot,
  terminalDiagnostics,
  write,
} from "./terminals";

let window: BrowserWindow | null = null;

/**
 * The known project names, re-read on every snapshot.
 *
 * The renderer only ever sends an identifier, never a command: anything coming
 * from it that ended up in a shell would be an injection. So we validate against
 * this list before inserting anything.
 */
let knownProjects = new Set<string>();
let projectsRoot = "";
let knownDirs = new Map<string, string>();

function isKnown(name: unknown): name is string {
  return typeof name === "string" && knownProjects.has(name);
}

/**
 * The absolute path of a project folder, or nothing.
 *
 * It goes into a remote `cd`: the root comes from the server, the folder from
 * the registry it holds, and both are re-checked here rather than taken on
 * trust — a folder that walks up a level would make git work elsewhere.
 */
function projectPath(dir: string | undefined): string | null {
  if (!(projectsRoot && dir)) {
    return null;
  }
  const path = `${projectsRoot.replace(/\/+$/, "")}/${dir}`;
  return validPath(path) ? path : null;
}

/**
 * What goes into the server's registry.
 *
 * Every field ends up in a column-separated file the server re-reads, and the
 * last column is a command it will execute. A pipe or a newline slipped into a
 * field would therefore write one more row — a project nobody asked for. We
 * refuse them here, before sending.
 */
function checkRegistration(fields: unknown): string | null {
  if (typeof fields !== "object" || fields === null) {
    return "invalid form";
  }
  const f = fields as Record<string, unknown>;
  const required = [
    "name",
    "dir",
    "package_manager",
    "host",
    "port",
    "command",
  ];
  for (const key of required) {
    if (typeof f[key] !== "string" || (f[key] as string).length === 0) {
      return `missing field: ${key}`;
    }
  }
  for (const [key, value] of Object.entries(f)) {
    if (typeof value === "string" && /[|\r\n]/.test(value)) {
      return `field ${key} cannot contain "|" or a newline`;
    }
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(f.name as string)) {
    return "name: lowercase letters, digits, dot, dash and underscore";
  }
  if (
    !/^[\w.\-/]+$/.test(f.dir as string) ||
    (f.dir as string).includes("..")
  ) {
    return 'dir: a simple relative path, without ".."';
  }
  const port = Number(f.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    return "port: an integer between 1024 and 65535";
  }
  return null;
}

async function snapshot(): Promise<Snapshot | null> {
  try {
    const raw = await channel.run(`${command()} snapshot`);
    const start = raw.indexOf("{");
    if (start === -1) {
      return null;
    }
    const data = JSON.parse(raw.slice(start)) as Snapshot;
    knownProjects = new Set(data.projects.map((p) => p.name));
    setRoot(data.root);
    projectsRoot = data.root;
    knownDirs = new Map(data.projects.map((p) => [p.name, p.dir]));
    return data;
  } catch {
    return null;
  }
}

/**
 * What this particular machine can do, observed once per connection.
 *
 * The app cannot assume a server manages secrets, keeps a project registry or
 * has an agent installed: mine does, someone else's may not. So we ask it, and
 * the interface hides what does not exist rather than opening empty pages.
 *
 * Every check is a side-effect-free command of which we only read the exit code
 * — never a command that would act in order to find out whether it exists.
 */
let knownCapabilities: Capabilities | null = null;

/**
 * What has to be dropped whenever the server list changes.
 *
 * The channels were talking to the old servers and reopen on the new ones at
 * the next call; the capabilities described a machine we may no longer be on,
 * and asking again costs four commands.
 */
function settle(config: ServersConfig): ServersConfig {
  agentClient.closeAll();
  knownCapabilities = null;
  channel.close();
  closeAll();

  return config;
}

async function answers(sub: string): Promise<boolean> {
  try {
    const output = await channel.run(
      `${command()} ${sub} >/dev/null 2>&1 && echo YES || echo NO`,
      20_000
    );
    return output.includes("YES");
  } catch {
    return false;
  }
}

async function computeCapabilities(): Promise<Capabilities> {
  const pattern = logPath(profile(), "-");
  const logsDir = pattern.slice(0, pattern.lastIndexOf("/"));

  const [secrets, registry, sessions, processes, logs, present] =
    await Promise.all([
      answers("secrets --json"),
      answers("projects"),
      answers("sessions --json"),
      answers("top"),
      logsDir
        ? channel
            .run(`test -d ${logsDir} && echo YES || echo NO`, 10_000)
            .then((output) => output.includes("YES"))
            .catch(() => false)
        : Promise.resolve(true),
      channel
        .run(
          "for a in claude codex; do command -v $a >/dev/null 2>&1 && echo $a; done",
          10_000
        )
        .catch(() => ""),
    ]);

  const agents: TerminalAgent[] = (["claude", "codex"] as const).filter((a) =>
    present.includes(a)
  );

  return { secrets, registry, sessions, processes, logs, agents };
}

/**
 * What the native window paints before the page does, and while it resizes.
 *
 * The main process has no stylesheet, so the value comes from the design tokens
 * as data. It follows the system: the theme forced in the settings lives in the
 * renderer, and this colour is only ever seen at the edges.
 */
function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? DARK.base : LIGHT.base;
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 560,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: windowBackground(),
    icon: new URL("../../build/icon.png", import.meta.url).pathname,
    webPreferences: {
      preload: new URL("../preload/index.mjs", import.meta.url).pathname,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on("ready-to-show", () => window?.show());

  nativeTheme.on("updated", () =>
    window?.setBackgroundColor(windowBackground())
  );

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    window.loadURL(devUrl);
  } else {
    window.loadFile(
      new URL("../renderer/index.html", import.meta.url).pathname
    );
  }
}

const logStoppers = new Map<string, () => void>();

function registerChannels(): void {
  registerAgentChannels();
  registerInspection();
  registerCatalog();
  registerInstall();

  ipcMain.handle("snapshot", () => snapshot());

  ipcMain.handle("capabilities", async (): Promise<Capabilities> => {
    if (!knownCapabilities) {
      knownCapabilities = await computeCapabilities();
    }
    return knownCapabilities;
  });

  ipcMain.handle("top", async (): Promise<ProcessInfo[]> => {
    try {
      const raw = await channel.run(`${command()} top`);
      const start = raw.indexOf("[");
      return start === -1
        ? []
        : (JSON.parse(raw.slice(start)) as ProcessInfo[]);
    } catch {
      return [];
    }
  });

  ipcMain.handle("terminal-diagnostics", () => terminalDiagnostics());

  ipcMain.handle("completion-catalog", () => catalog());
  ipcMain.handle("completion-history", () => history());
  ipcMain.handle(
    "completion-paths",
    (_e, dir: unknown, token: unknown): Promise<string[]> =>
      typeof dir === "string" && typeof token === "string"
        ? paths(dir, token)
        : Promise.resolve([])
  );

  ipcMain.handle("sessions", async (): Promise<Session[]> => {
    try {
      const raw = await channel.run(`${command()} sessions --json`);
      const start = raw.indexOf("[");
      return start === -1 ? [] : (JSON.parse(raw.slice(start)) as Session[]);
    } catch {
      return [];
    }
  });

  ipcMain.handle("session-stop", async (_e, pid: unknown) => {
    // The server re-checks that this PID really is a session: the interface must
    // never be able to stop any process on the machine.
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 2) {
      return { ok: false, message: "invalid PID" };
    }
    const output = await channel.run(
      `${command()} sessions kill ${pid} 2>&1`,
      20_000
    );
    return { ok: true, message: output.trim() };
  });

  ipcMain.handle("process-stop", async (_e, pid: unknown) => {
    // The server re-checks who owns this PID and refuses what carries the
    // session: the interface must not be able to cut the branch it sits on.
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 2) {
      return { ok: false, message: "invalid PID" };
    }
    const output = await channel.run(`${command()} kill ${pid} 2>&1`, 20_000);
    const message = output.trim();
    return { ok: !message.includes("✗"), message };
  });

  ipcMain.handle("server-reboot", async (): Promise<ActionResult> => {
    // `reboot --yes` skips the question asked at the terminal: confirmation has
    // already happened in the interface. The command does not return cleanly —
    // the connection drops with the machine, and that is expected.
    try {
      await channel.run(`${command()} reboot --yes 2>&1`, 15_000);
    } catch {
      // The channel dropped: that is the sign the reboot has started.
    }
    channel.close();
    closeAll();
    return { ok: true, message: "reboot started" };
  });

  ipcMain.handle("sessions-clean", async () => {
    const output = await channel.run(
      `${command()} sessions clean 120 2>&1`,
      30_000
    );
    return { ok: true, message: output.trim() };
  });

  ipcMain.handle(
    "branches",
    async (_e, project: unknown): Promise<Branches | null> => {
      if (!isKnown(project)) {
        return null;
      }
      try {
        const raw = await channel.run(`${command()} branches ${project}`);
        const start = raw.indexOf("{");
        return start === -1 ? null : JSON.parse(raw.slice(start));
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    "git-status",
    async (_e, projects: unknown, fetch: unknown): Promise<GitStatus[]> => {
      const asked =
        Array.isArray(projects) && projects.length > 0
          ? projects.filter(isKnown)
          : [...knownProjects];
      const targets = asked
        .map((project) => ({
          project,
          path: projectPath(knownDirs.get(project)),
        }))
        .filter((t): t is { project: string; path: string } => t.path !== null);
      try {
        return await inspect(targets, fetch === true);
      } catch {
        return [];
      }
    }
  );

  ipcMain.handle(
    "git-pull",
    async (_e, project: unknown): Promise<ActionResult> => {
      if (!isKnown(project)) {
        return { ok: false, message: "unknown project" };
      }
      const path = projectPath(knownDirs.get(project));
      if (!path) {
        return { ok: false, message: "unknown folder" };
      }
      try {
        return await pull(path);
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    }
  );

  /**
   * The working tree of a project's repository.
   *
   * Read-only, and local to the server: no fetch, nothing over the network — so
   * it can be asked for every time the DIFF tab opens without costing anything.
   */
  ipcMain.handle(
    "git-worktree",
    async (_e, project: unknown): Promise<WorkingTree | null> => {
      if (!isKnown(project)) {
        return null;
      }
      const path = projectPath(knownDirs.get(project));
      if (!path) {
        return null;
      }
      try {
        return await workingTree(project, path);
      } catch {
        return null;
      }
    }
  );

  /**
   * One file's diff. The project is validated against the snapshot's list, and
   * the file name is re-checked in `fileDiff` — the renderer is never a source
   * of paths, even for paths it received from us.
   */
  ipcMain.handle(
    "git-file-diff",
    async (
      _e,
      project: unknown,
      file: unknown,
      untracked: unknown
    ): Promise<FileDiff | null> => {
      if (!isKnown(project) || typeof file !== "string") {
        return null;
      }
      const path = projectPath(knownDirs.get(project));
      if (!path) {
        return null;
      }
      try {
        return await fileDiff(path, file, untracked === true);
      } catch (error) {
        return {
          path: file,
          patch: "",
          binary: false,
          problem: (error as Error).message,
        };
      }
    }
  );

  ipcMain.handle("secrets", async (): Promise<Secret[]> => {
    try {
      const raw = await channel.run(`${command()} secrets --json`);
      const start = raw.indexOf("[");
      return start === -1 ? [] : (JSON.parse(raw.slice(start)) as Secret[]);
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "secret-set",
    async (_e, key: unknown, value: unknown): Promise<ActionResult> => {
      if (typeof key !== "string" || !/^[A-Z][A-Z0-9_]{1,60}$/.test(key)) {
        return { ok: false, message: "invalid key" };
      }
      if (typeof value !== "string" || value.length === 0) {
        return { ok: false, message: "empty value" };
      }
      // A multi-line value would be truncated at the first line on the server,
      // and the rest would be read as further lines of the environment file.
      if (/[\r\n]/.test(value)) {
        return { ok: false, message: "the value cannot span several lines" };
      }
      const res = await sendSecret(key, value);
      return { ok: res.code === 0, message: res.output.trim() };
    }
  );

  ipcMain.handle("projects", async (): Promise<Registration[]> => {
    try {
      const raw = await channel.run(`${command()} projects`);
      const start = raw.indexOf("[");
      return start === -1
        ? []
        : (JSON.parse(raw.slice(start)) as Registration[]);
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "project-write",
    async (_e, fields: unknown): Promise<ActionResult> => {
      const error = checkRegistration(fields);
      if (error) {
        return { ok: false, message: error };
      }
      const f = fields as Record<string, string>;
      const row = [
        f.name,
        f.dir,
        f.repo_url || "-",
        f.package_manager,
        f.host,
        f.port,
        f.subdomain || "-",
        f.command,
        // Column 9. "-" means "derive it from the package manager", which is
        // what an empty field in the form means too.
        f.install || "-",
      ].join("|");
      const res = await sendLine(`${command()} project add`, row, 300_000);
      return { ok: res.code === 0, message: res.output.trim() };
    }
  );

  ipcMain.handle("project-remove", async (_e, name: unknown) => {
    if (!isKnown(name)) {
      return { ok: false, message: "unknown project" };
    }
    const output = await channel.run(
      `${command()} project remove ${name} 2>&1`,
      60_000
    );
    return { ok: true, message: output.trim() };
  });

  ipcMain.handle("servers", (): ServersConfig => read());
  ipcMain.handle("ssh-hosts", (): string[] => sshHosts());
  ipcMain.handle("servers-write", (_e, config: ServersConfig) =>
    settle(writeConfig(config))
  );

  ipcMain.handle(
    "server-add",
    async (_e, draft: ServerDraft): Promise<AgentResponse<ServerAdded>> => {
      try {
        const created = await addServer(draft);

        return {
          ok: true,
          result: {
            config: settle(read()),
            copyId: created.copyId,
            publicKey: created.publicKey,
            server: created.server,
          },
        };
      } catch (error) {
        return error instanceof SetupError
          ? {
              ok: false,
              error: {
                code: "bad_request",
                fix: error.fix,
                message: error.message,
              },
            }
          : {
              ok: false,
              error: {
                code: "internal",
                message: "Ce serveur n'a pas pu être ajouté.",
                fix: "Réessayez ; si cela recommence, générez la clé plutôt que de l'importer.",
              },
            };
      }
    }
  );

  ipcMain.handle("server-rename", (_e, id: string, name: string) =>
    settle(renameServer(id, name))
  );
  ipcMain.handle("server-activate", (_e, id: string) =>
    settle(activateServer(id))
  );
  ipcMain.handle("server-remove", (_e, id: string) => settle(removeServer(id)));

  ipcMain.handle(
    "server-host-key",
    async (_e, id: string): Promise<AgentResponse<HostKeyDecision>> => ({
      ok: true,
      result: await hostKey(id),
    })
  );

  ipcMain.handle(
    "server-trust-reinstalled",
    async (_e, id: string): Promise<AgentResponse<ServersConfig>> => ({
      ok: true,
      result: settle(await trustReinstalled(id)),
    })
  );

  ipcMain.handle("server-public-key", (_e, id: string): string | null =>
    publicKey(id)
  );

  /**
   * The file picker for an imported key.
   *
   * The renderer never names a path of its own: it opens this dialog, the user
   * points at a file, and only then does a path reach the main process.
   */
  ipcMain.handle("key-file-pick", async (): Promise<string | null> => {
    const picked = await dialog.showOpenDialog({
      buttonLabel: "Importer",
      defaultPath: join(app.getPath("home"), ".ssh"),
      properties: ["openFile", "showHiddenFiles"],
      title: "Choisir une clé privée",
    });

    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  });
  ipcMain.handle("diagnose", () => diagnose());
  ipcMain.handle("installer-present", () => installerPresent());
  ipcMain.handle("install", () => runInstaller());

  ipcMain.handle(
    "action",
    async (_e, action: Action, project: unknown): Promise<ActionResult> => {
      const actions: Action[] = ["up", "down", "restart"];
      if (!actions.includes(action)) {
        return { ok: false, message: "unknown action" };
      }
      if (project !== "all" && !isKnown(project)) {
        return { ok: false, message: `unknown project: ${String(project)}` };
      }
      try {
        const output = await channel.run(
          `${command()} ${action} ${project} 2>&1`,
          120_000
        );
        return { ok: true, message: output.trim() };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    }
  );

  ipcMain.handle("branch", async (_e, project: unknown, target: unknown) => {
    if (!isKnown(project)) {
      return { ok: false, message: "unknown project" };
    }
    if (typeof target !== "string" || !/^[\w.\-/]{1,120}$/.test(target)) {
      return { ok: false, message: "invalid branch name" };
    }
    const output = await channel.run(
      `${command()} branch ${project} ${target} 2>&1`,
      60_000
    );
    return { ok: true, message: output.trim() };
  });

  ipcMain.handle("open-url", (_e, url: unknown) => {
    if (typeof url === "string" && /^https:\/\//.test(url)) {
      shell.openExternal(url);
    }
  });

  ipcMain.handle("open-editor", (_e, dir: unknown) => {
    if (typeof dir !== "string" || !/^[\w.\-/]{1,200}$/.test(dir)) {
      return;
    }
    // The editor opens a remote folder through the SSH host as it is named in
    // the system configuration — the active server's, not an agreed-upon name.
    // The URL comes from the profile: Zed, VS Code and Cursor do not open the
    // same way, and the next one will do it differently again.
    const repo = dir.split("/")[0];
    const url = projectsRoot
      ? editorUrl(profile(), activeHost(), projectsRoot, repo)
      : null;
    if (url) {
      shell.openExternal(url);
    }
  });

  const kinds: TerminalKind[] = ["shell", "claude", "codex", "tui"];

  ipcMain.on(
    "terminal-open",
    (
      event,
      id: unknown,
      kind: unknown,
      project: unknown,
      cols: unknown,
      rows: unknown
    ) => {
      if (typeof id !== "string" || !kinds.includes(kind as TerminalKind)) {
        return;
      }
      // A terminal without a project targets the server root: that is
      // legitimate. With a project, its name must come from the list the server
      // gave.
      let dir: string | null = null;
      if (project !== null) {
        if (!isKnown(project)) {
          return;
        }
        dir = knownDirs.get(project) ?? null;
      }
      open(
        id,
        kind as TerminalKind,
        dir,
        typeof project === "string" ? project : null,
        typeof cols === "number" ? cols : 100,
        typeof rows === "number" ? rows : 30,
        event.sender
      );
    }
  );

  ipcMain.on("terminal-write", (_e, id: unknown, data: unknown) => {
    if (typeof id === "string" && typeof data === "string") {
      write(id, data);
    }
  });

  ipcMain.on(
    "terminal-resize",
    (_e, id: unknown, cols: unknown, rows: unknown) => {
      if (
        typeof id === "string" &&
        typeof cols === "number" &&
        typeof rows === "number"
      ) {
        resize(id, cols, rows);
      }
    }
  );

  ipcMain.on("terminal-close", (_e, id: unknown) => {
    if (typeof id === "string") {
      close(id);
    }
  });

  ipcMain.on("log-follow", (event, project: unknown) => {
    if (!isKnown(project)) {
      return;
    }
    logStoppers.get(project)?.();
    const stop = followLog(project, (text) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("log-line", { project, text });
      }
    });
    logStoppers.set(project, stop);
  });

  ipcMain.on("log-stop", (_e, project: unknown) => {
    if (typeof project === "string") {
      logStoppers.get(project)?.();
      logStoppers.delete(project);
    }
  });
}

app.whenReady().then(() => {
  registerChannels();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  for (const stop of logStoppers.values()) {
    stop();
  }
  logStoppers.clear();
  closeAll();
  channel.close();
  agentClient.closeAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
