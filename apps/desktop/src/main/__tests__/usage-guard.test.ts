import { afterEach, describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMAND_NAMES,
  type CommandName,
} from "@pupitre/shared/agent-protocol";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { AgentError } from "@shared/agent";
import {
  type AgentClient,
  createAgentClient,
  type UsageGate,
} from "../agent-client";
import { mutates, READING_COMMANDS, usageError } from "../usage-guard";
import { echoAgent } from "./fixtures/echo-agent";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const MAIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const CONSOLE_URL = "https://app.pupitre.test/dashboard";

const GRANTED: AccountResponse<UsageRight> = {
  ok: true,
  result: {
    license: "valid",
    source: "platform",
    status: "granted",
    validUntil: null,
  },
};

const ABSENT: AccountResponse<UsageRight> = {
  ok: false,
  error: {
    code: "license_required",
    fix: `Connecte-toi depuis les réglages, ou ouvre la console : ${CONSOLE_URL}`,
    message: "Installer un serveur demande un compte Pupitre.",
  },
};

const STALE: AccountResponse<UsageRight> = {
  ok: false,
  error: {
    code: "license_required",
    fix: `Reconnecte cet appareil, ou vérifie l'état du compte : ${CONSOLE_URL}`,
    message:
      "La plateforme n'a pas répondu depuis plus de sept jours : la licence a expiré.",
  },
};

const SUSPENDED: AccountResponse<UsageRight> = {
  ok: false,
  error: {
    code: "server_suspended",
    fix: `Écris à support@pupitre.studio : ${CONSOLE_URL}`,
    message: "Cette organisation est suspendue.",
  },
};

const STOPPING: [CommandName, unknown][] = [
  ["project.down", { name: "api" }],
  ["project.restart", { name: "api" }],
  ["sessions.clean", {}],
  ["process.kill", { pid: 4242 }],
  ["reboot", {}],
  ["uninstall", { modules: ["db.postgres"] }],
];

let agent: FakeAgent | null = null;

function gateOf(answer: AccountResponse<UsageRight>): UsageGate {
  return () => usageError(() => answer);
}

function client(fixture: string, gate?: UsageGate): AgentClient {
  agent = fakeAgent(fixture);

  return createAgentClient({ appVersion: "0.1.0", gate, spawn: agent.spawn });
}

function refusalOf(answer: AccountResponse<UsageRight>): AgentError {
  const error = usageError(() => answer);

  if (!error) {
    throw new Error("ce droit d'usage n'est pas un refus");
  }

  return error;
}

afterEach(() => {
  agent?.killAll();
  agent = null;
});

describe("what the usage right lets through", () => {
  it("opens reading a machine and nothing else", () => {
    expect([...READING_COMMANDS].sort()).toEqual(
      (
        [
          "backup.contents",
          "backup.status",
          "catalog",
          "completions",
          "db.url",
          "diag",
          "doctor",
          "fs.list",
          "fs.read",
          "fs.stat",
          "hello",
          "keys.list",
          "module.config",
          "ping",
          "probe",
          "processes.list",
          "project.branches",
          "project.diff",
          "project.git_status",
          "project.list",
          "project.logs",
          "project.url",
          "project.working_tree",
          "report",
          "service.logs",
          "service.secret",
          "service.status",
          "sessions.list",
          "shots.list",
          "shots.read",
          "shots.url",
          "snapshot",
          "status",
          "tunnel.status",
        ] as CommandName[]
      ).sort()
    );
  });

  it("treats every contract command as mutating until it is declared readable", () => {
    const unclassified = COMMAND_NAMES.filter(
      (cmd) => !(READING_COMMANDS.has(cmd) || mutates(cmd))
    );

    expect(unclassified).toEqual([]);
    expect(mutates("snapshot")).toBe(false);
    expect(mutates("install")).toBe(true);
    expect(mutates("project.down")).toBe(true);
    expect(mutates("sessions.clean")).toBe(true);
    expect(mutates("service.start")).toBe(true);
    expect(mutates("service.stop")).toBe(true);
    expect(mutates("service.restart")).toBe(true);
    expect(mutates("shots.clean")).toBe(true);
  });
});

describe("a missing or expired usage right", () => {
  const refusals: [string, AccountResponse<UsageRight>][] = [
    ["absent", ABSENT],
    ["expiré", STALE],
    ["suspendu", SUSPENDED],
  ];

  for (const [name, refused] of refusals) {
    it(`returns the guard's code and fix on a ${name} usage right`, async () => {
      const answer = await client("restricted.jsonl", gateOf(refused)).request(
        "srv-1",
        "install",
        {
          config: {},
          defer: [],
          modules: ["core.system"],
          secrets_stdin: false,
        }
      );

      expect(answer).toEqual({ ok: false, error: refusalOf(refused) });
      expect(agent?.started()).toBe(0);
    });
  }

  it("sends no stop command to the agent, which is never launched", async () => {
    const guarded = client("restricted.jsonl", gateOf(ABSENT));

    for (const [cmd, params] of STOPPING) {
      const answer = await guarded.request(
        "srv-1",
        cmd as "reboot",
        params as never
      );

      expect(answer).toMatchObject({
        ok: false,
        error: { code: "license_required" },
      });
    }

    expect(agent?.started()).toBe(0);
    expect(agent?.trace()).toEqual([]);
    expect(agent?.written()).toEqual([]);
  });

  it("lets the machine be read: the dashboard stays in view", async () => {
    const guarded = client("restricted.jsonl", gateOf(ABSENT));

    const snapshot = await guarded.request("srv-1", "snapshot");

    expect(snapshot.ok).toBe(true);
    expect(snapshot.ok && snapshot.result.projects[0]?.state).toBe("online");
    expect(snapshot.ok && snapshot.result.sessions).toHaveLength(1);
    expect(agent?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=snapshot"]);

    guarded.closeAll();
  });
});

describe("a mutating channel added tomorrow", () => {
  it("is refused across the whole contract surface, call, stream and envelope", async () => {
    const guarded = client("restricted.jsonl", gateOf(ABSENT));
    const acting = COMMAND_NAMES.filter(mutates);

    expect(acting.length).toBeGreaterThan(0);

    for (const cmd of acting) {
      const enveloped = await guarded.request("srv-1", cmd as "reboot");

      expect([cmd, enveloped]).toEqual([
        cmd,
        { ok: false, error: refusalOf(ABSENT) },
      ]);

      await expect(
        guarded.call("srv-1", cmd as "reboot")
      ).rejects.toMatchObject({ code: "license_required" });

      await expect(
        guarded.stream("srv-1", cmd as "reboot", {}, () => undefined)
      ).rejects.toMatchObject({ code: "license_required" });
    }

    expect(agent?.started()).toBe(0);
    expect(agent?.written()).toEqual([]);
  });

  it("lets every read command of the contract through to the agent", async () => {
    const echo = echoAgent();
    const guarded = createAgentClient({
      appVersion: "0.1.0",
      gate: gateOf(ABSENT),
      spawn: echo.spawn,
    });
    const reading = COMMAND_NAMES.filter((cmd) => !mutates(cmd));

    for (const cmd of reading) {
      const answer = await guarded.request("srv-1", cmd as "ping");

      expect([cmd, answer.ok]).toEqual([cmd, true]);
    }

    expect(new Set(echo.asked())).toEqual(new Set(["hello", ...reading]));

    guarded.closeAll();
    echo.killAll();
  });

  it("has a single door to the agent: one client, and it carries the guard", async () => {
    const files = (await readdir(MAIN_DIR)).filter((name) =>
      name.endsWith(".ts")
    );
    const sources = await Promise.all(
      files.map(
        async (name) =>
          [name, await readFile(join(MAIN_DIR, name), "utf8")] as const
      )
    );

    const callers = sources.filter(([name]) => name !== "agent-client.ts");
    const builders = callers
      .filter(([, source]) => source.includes("createAgentClient("))
      .map(([name]) => name);
    const openers = callers
      .filter(([, source]) => source.includes("sshSpawn("))
      .map(([name]) => name);

    expect(builders).toEqual(["agent.ts"]);
    expect(openers).toEqual(["agent.ts"]);

    const wiring = sources.find(([name]) => name === "agent.ts")?.[1] ?? "";

    expect(wiring).toContain("gate:");
    expect(wiring).toContain("account.guard()");
  });
});

describe("the two sources of refusal stay distinct", () => {
  it("lets the agent refuse in its own words when the account is valid", async () => {
    const guarded = client("restricted.jsonl", gateOf(GRANTED));

    const snapshot = await guarded.request("srv-1", "snapshot");

    expect(snapshot.ok && snapshot.result.license).toBe("restricted");

    const refused = await guarded.request("srv-1", "project.down", {
      name: "api",
    });

    expect(refused).toMatchObject({
      ok: false,
      error: {
        code: "license_required",
        fix: "Ouvrez https://app.pupitre.studio : Pupitre est gratuit jusqu'à 3 serveurs par organisation, une licence est requise au-delà.",
        message: "licence requise : ce serveur est en mode restreint",
      },
    });

    const status = await guarded.request("srv-1", "status");

    expect(status.ok && status.result.projects[0]?.name).toBe("api");

    guarded.closeAll();
  });

  it("lets everything through when no guard is set, as on a replay client", async () => {
    const free = client("restricted.jsonl");

    const snapshot = await free.request("srv-1", "snapshot");
    const refused = await free.request("srv-1", "project.down", {
      name: "api",
    });

    expect(snapshot.ok).toBe(true);
    expect(refused).toMatchObject({
      ok: false,
      error: {
        message: "licence requise : ce serveur est en mode restreint",
      },
    });

    free.closeAll();
  });
});
