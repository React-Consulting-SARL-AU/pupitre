import { afterEach, describe, expect, it } from "bun:test";
import {
  COMMAND_NAMES,
  type CommandName,
} from "@pupitre/shared/agent-protocol";
import type { AccountResponse, UsageRight } from "@shared/account";
import { type AgentClient, createAgentClient } from "../agent-client";
import { guardedRequest, mutates, READING_COMMANDS } from "../usage-guard";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

/**
 * The usage right in front of the channels.
 *
 * What reads goes through, what acts stops here: the proof is that the fake
 * agent never sees the command. Nothing running on the machine is stopped by
 * this path, because nothing is sent.
 */

const CONSOLE_URL = "https://app.pupitre.test/dashboard";

const GRANTED: AccountResponse<UsageRight> = {
  ok: true,
  result: {
    entitlement: "valid",
    source: "platform",
    status: "granted",
    validUntil: null,
  },
};

const ABSENT: AccountResponse<UsageRight> = {
  ok: false,
  error: {
    code: "entitlement_required",
    fix: `Connecte-toi depuis les réglages, ou ouvre la console : ${CONSOLE_URL}`,
    message: "Installer un serveur demande un compte Pupitre.",
  },
};

const STALE: AccountResponse<UsageRight> = {
  ok: false,
  error: {
    code: "entitlement_required",
    fix: `Reconnecte cet appareil, ou vérifie l'état du compte : ${CONSOLE_URL}`,
    message:
      "La plateforme n'a pas répondu depuis plus de sept jours : le droit d'usage a expiré.",
  },
};

const SUSPENDED: AccountResponse<UsageRight> = {
  ok: false,
  error: {
    code: "server_suspended",
    fix: `Régularise l'abonnement dans la console : ${CONSOLE_URL}`,
    message: "Le droit d'usage de cette organisation est suspendu.",
  },
};

/** What stops something on the machine, with enough to call it. */
const STOPPING: [CommandName, unknown][] = [
  ["project.down", { name: "api" }],
  ["project.restart", { name: "api" }],
  ["sessions.clean", {}],
  ["process.kill", { pid: 4242 }],
  ["reboot", {}],
  ["uninstall", { modules: ["db.postgres"] }],
];

let agent: FakeAgent | null = null;

function client(fixture: string): AgentClient {
  agent = fakeAgent(fixture);

  return createAgentClient({ appVersion: "0.1.0", spawn: agent.spawn });
}

afterEach(() => {
  agent?.killAll();
  agent = null;
});

describe("ce que le droit d'usage laisse passer", () => {
  it("ouvre la lecture d'une machine et rien d'autre", () => {
    expect([...READING_COMMANDS].sort()).toEqual(
      (
        [
          "catalog",
          "completions",
          "db.url",
          "diag",
          "doctor",
          "hello",
          "keys.list",
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
          "service.secret",
          "service.status",
          "sessions.list",
          "shots.list",
          "shots.read",
          "shots.url",
          "snapshot",
          "status",
          "secrets.status",
          "tunnel.status",
        ] as CommandName[]
      ).sort()
    );
  });

  it("tient toute commande du contrat pour mutante tant qu'elle n'est pas déclarée lisible", () => {
    const unclassified = COMMAND_NAMES.filter(
      (cmd) => !(READING_COMMANDS.has(cmd) || mutates(cmd))
    );

    expect(unclassified).toEqual([]);
    expect(mutates("snapshot")).toBe(false);
    expect(mutates("install")).toBe(true);
    expect(mutates("project.down")).toBe(true);
    expect(mutates("sessions.clean")).toBe(true);
  });
});

describe("un droit d'usage absent ou expiré", () => {
  const refusals: [string, AccountResponse<UsageRight>][] = [
    ["absent", ABSENT],
    ["expiré", STALE],
    ["suspendu", SUSPENDED],
  ];

  for (const [name, refused] of refusals) {
    it(`rend le code et le remède du garde sur un droit d'usage ${name}`, async () => {
      const answer = await guardedRequest(
        client("restricted.jsonl"),
        () => refused,
        "srv-1",
        "install",
        { config: {}, modules: ["core.system"], secrets_stdin: false }
      );

      expect(answer).toEqual({
        ok: false,
        error: (refused.ok ? {} : refused.error) as never,
      });
    });
  }

  /**
   * The product's promise: nothing that runs is stopped. The refusal is not the
   * agent's here — the app does not even open the channel.
   */
  it("n'envoie aucune commande d'arrêt à l'agent, qui n'est jamais lancé", async () => {
    const guarded = client("restricted.jsonl");

    for (const [cmd, params] of STOPPING) {
      const answer = await guardedRequest(
        guarded,
        () => ABSENT,
        "srv-1",
        cmd as "reboot",
        params as never
      );

      expect(answer).toMatchObject({
        ok: false,
        error: { code: "entitlement_required" },
      });
    }

    expect(agent?.started()).toBe(0);
    expect(agent?.trace()).toEqual([]);
    expect(agent?.written()).toEqual([]);
  });

  it("laisse lire la machine : le tableau de bord reste devant les yeux", async () => {
    const guarded = client("restricted.jsonl");

    const snapshot = await guardedRequest(
      guarded,
      () => ABSENT,
      "srv-1",
      "snapshot"
    );

    expect(snapshot.ok).toBe(true);
    expect(snapshot.ok && snapshot.result.projects[0]?.state).toBe("online");
    expect(snapshot.ok && snapshot.result.sessions).toHaveLength(1);
    expect(agent?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=snapshot"]);

    guarded.closeAll();
  });
});

describe("les deux sources de refus restent distinctes", () => {
  it("laisse l'agent refuser avec ses propres mots quand le compte, lui, est valide", async () => {
    const guarded = client("restricted.jsonl");

    const snapshot = await guardedRequest(
      guarded,
      () => GRANTED,
      "srv-1",
      "snapshot"
    );

    expect(snapshot.ok && snapshot.result.entitlement).toBe("restricted");

    const refused = await guardedRequest(
      guarded,
      () => GRANTED,
      "srv-1",
      "project.down",
      { name: "api" }
    );

    expect(refused).toMatchObject({
      ok: false,
      error: {
        code: "entitlement_required",
        fix: "Ouvre https://app.pupitre.studio pour renouveler le droit d'usage de ce serveur.",
        message: "droit d'usage requis : ce serveur est en mode restreint",
      },
    });

    // Le serveur reste lisible malgré son mode restreint.
    const status = await guardedRequest(
      guarded,
      () => GRANTED,
      "srv-1",
      "status"
    );

    expect(status.ok && status.result.projects[0]?.name).toBe("api");

    guarded.closeAll();
  });
});
