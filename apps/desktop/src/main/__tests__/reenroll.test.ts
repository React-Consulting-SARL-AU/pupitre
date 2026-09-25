import { afterEach, describe, expect, it } from "bun:test";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { Enrollment } from "../account-run";
import { type AgentClient, createAgentClient } from "../agent-client";
import { type ReenrollDeps, runReenroll } from "../reenroll-run";
import { usageError } from "../usage-guard";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

/**
 * Repairing a restricted server from the app.
 *
 * A revoked token leaves a machine that reads and refuses to act. The repair is
 * the seventh command restricted mode admits: a fresh enrolment token, asked of
 * the platform and handed to the agent on the secret line. Nothing running on
 * the server is touched — the exchange repairs a right, it restarts nothing.
 */

const SERVER = "staging";

const PLATFORM = "https://app.pupitre.test/api/v1";

const TOKEN = "enr-jeton-tres-secret-app29";

const PLATFORM_SERVER = "srv-platform-1";

const GRANTED: AccountResponse<UsageRight> = {
  ok: true,
  result: {
    entitlement: "valid",
    source: "platform",
    status: "granted",
    validUntil: null,
  },
};

const ABSENT_FIX =
  "Connecte-toi depuis les réglages, ou ouvre la console : https://app.pupitre.test/dashboard";

const ABSENT: AccountResponse<UsageRight> = {
  ok: false,
  error: {
    code: "entitlement_required",
    fix: ABSENT_FIX,
    message: "Installer un serveur demande un compte Pupitre.",
  },
};

const ENROLLED: Enrollment = {
  release: {
    channel: "stable",
    sha256: "",
    signature: "",
    url: "",
    version: "1.0.0",
  },
  serverId: PLATFORM_SERVER,
};

let fake: FakeAgent | null = null;

/** The machine is read on the session sudo opens without a password, the enrolment rides the privileged one. */
const RESTRICTED = ["reenroll-restricted.jsonl", "reenroll-enroll.jsonl"];

function agent(
  fixture: string[],
  guard: AccountResponse<UsageRight> = GRANTED
): AgentClient {
  fake = fakeAgent(fixture);

  return createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 2, firstMs: 5, maxMs: 20 },
    gate: () => usageError(() => guard),
    spawn: fake.spawn,
  });
}

/**
 * The token is taken once and burnt, exactly as `takeEnrollmentToken` does: a
 * second reader gets nothing, so a replay cannot resend an exchange the
 * platform has already closed.
 */
function vault(): { grant: ReenrollDeps["grant"]; taken: string[] } {
  const taken: string[] = [];

  return {
    grant: (platformServerId) => {
      if (platformServerId !== PLATFORM_SERVER || taken.length > 0) {
        return null;
      }
      taken.push(TOKEN);

      return { platformUrl: PLATFORM, token: TOKEN };
    },
    taken,
  };
}

function deps(
  client: AgentClient,
  over: Partial<ReenrollDeps> = {}
): ReenrollDeps {
  return {
    client,
    enroll: () => Promise.resolve({ ok: true, result: ENROLLED }),
    grant: vault().grant,
    guard: () => GRANTED,
    probe: () =>
      Promise.resolve({
        ok: false,
        error: {
          code: "disconnected",
          message: "La sonde ne devrait pas être nécessaire ici.",
        },
      }),
    ...over,
  };
}

afterEach(() => {
  fake?.killAll();
  fake = null;
});

describe("un serveur restreint au jeton révoqué", () => {
  it("redevient valide après l'action, sans passer par la console", async () => {
    const client = agent(RESTRICTED);

    const before = await client.request(SERVER, "project.down", {
      name: "api",
    });

    expect(before).toMatchObject({
      ok: false,
      error: {
        code: "entitlement_required",
        message: "droit d'usage requis : ce serveur est en mode restreint",
      },
    });

    const repaired = await runReenroll(SERVER, deps(client));

    expect(repaired).toEqual({
      ok: true,
      result: {
        enrolled: true,
        entitlement: "valid",
        synced_at: "2026-09-05T10:00:00Z",
      },
    });

    const snapshot = await client.request(SERVER, "snapshot");

    expect(snapshot.ok && snapshot.result.entitlement).toBe("valid");

    const acted = await client.request(SERVER, "project.down", { name: "api" });

    expect(acted).toMatchObject({ ok: true, result: { state: "stopped" } });
    expect(fake?.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=project.down",
      "id=3 cmd=snapshot",
      "id=1 cmd=hello",
      "id=2 cmd=enroll",
      "id=4 cmd=snapshot",
      "id=5 cmd=project.down",
    ]);
    expect(fake?.purposes()).toEqual(["control", "privileged"]);

    client.closeAll();
  });

  /**
   * The promise: nothing that runs stops. The repair sends no install and asks
   * for no restart — one `snapshot` to read the machine, one `enroll` to repair
   * the right, on the privileged session since it rewrites where the server
   * reports.
   */
  it("ne demande au serveur que de quoi lire la machine et refaire l'échange", async () => {
    const client = agent(RESTRICTED);

    const repaired = await runReenroll(SERVER, deps(client));

    expect(repaired.ok).toBe(true);
    expect(fake?.purposes()).toEqual(["control", "privileged"]);
    expect(fake?.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=snapshot",
      "id=1 cmd=hello",
      "id=2 cmd=enroll",
    ]);

    client.closeAll();
  });

  it("enrôle sur l'architecture que la machine a déclarée, sans sonde", async () => {
    const client = agent(RESTRICTED);
    const asked: string[] = [];
    let probed = 0;

    await runReenroll(
      SERVER,
      deps(client, {
        enroll: (arch) => {
          asked.push(arch);

          return Promise.resolve({ ok: true, result: ENROLLED });
        },
        probe: () => {
          probed += 1;

          return Promise.resolve({
            ok: false,
            error: { code: "disconnected", message: "jamais appelée" },
          });
        },
      })
    );

    expect(asked).toEqual(["arm64"]);
    expect(probed).toBe(0);

    client.closeAll();
  });
});

describe("le jeton d'enrôlement", () => {
  it("ne paraît dans aucun params, aucun journal, aucun résultat", async () => {
    const client = agent(RESTRICTED);
    const held = vault();

    const repaired = await runReenroll(SERVER, deps(client, held));

    const written = fake?.written() ?? [];
    const requests = written.filter((line) => line.includes('"cmd"'));
    const enrol = requests.find((line) => line.includes('"enroll"')) ?? "";

    // The bytes themselves, before any verdict on the exchange: a request
    // carrying the token would already be written by the time the transcript refuses it.
    for (const line of requests) {
      expect(line).not.toContain(TOKEN);
    }

    // The token crossed the channel only once, on the line following the
    // request, and in that form alone.
    expect(written.filter((line) => line.includes(TOKEN))).toEqual([
      JSON.stringify({ enrollment_token: TOKEN }),
    ]);

    expect(fake?.trace().join("\n")).not.toContain(TOKEN);
    expect(JSON.stringify(repaired)).not.toContain(TOKEN);

    // The request names the platform and announces the secret line, nothing more.
    expect(enrol).toContain(PLATFORM);
    expect(enrol).toContain('"secrets_stdin":true');
    expect(repaired.ok).toBe(true);
    expect(held.taken).toEqual([TOKEN]);

    client.closeAll();
  });

  it("n'envoie rien au serveur quand la plateforme n'a accordé aucun jeton", async () => {
    const client = agent(RESTRICTED);

    const repaired = await runReenroll(
      SERVER,
      deps(client, { grant: () => null })
    );

    expect(repaired).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=snapshot"]);

    client.closeAll();
  });
});

describe("un compte sans droit d'usage", () => {
  it("refuse la réparation dans les mots du compte, sans toucher la plateforme", async () => {
    const client = agent(RESTRICTED, ABSENT);
    let asked = 0;

    const repaired = await runReenroll(
      SERVER,
      deps(client, {
        enroll: () => {
          asked += 1;

          return Promise.resolve({ ok: true, result: ENROLLED });
        },
        guard: () => ABSENT,
      })
    );

    expect(repaired).toEqual({
      ok: false,
      error: {
        code: "entitlement_required",
        fix: ABSENT_FIX,
        message: "Installer un serveur demande un compte Pupitre.",
      },
    });
    expect(asked).toBe(0);
    expect(fake?.started()).toBe(0);
    expect(fake?.written()).toEqual([]);
  });

  /**
   * The action and the guard say the same thing rather than contradicting each
   * other: `enroll` acts, so the usage guard holds it too, and the app never
   * offers a gesture the platform would refuse.
   */
  it("s'accorde avec le garde des canaux, qui tient enroll comme toute commande mutante", async () => {
    const client = agent(RESTRICTED, ABSENT);

    const refused = await client.request(SERVER, "enroll", {
      platform_url: PLATFORM,
      secrets_stdin: true,
    });

    expect(refused).toMatchObject({
      ok: false,
      error: { code: "entitlement_required" },
    });
    expect(fake?.started()).toBe(0);
  });

  it("rend le refus de la plateforme tel quel quand c'est elle qui refuse", async () => {
    const client = agent(RESTRICTED);

    const repaired = await runReenroll(
      SERVER,
      deps(client, {
        enroll: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: "seat_quota_reached",
              fix: "Ajoute un siège dans la console.",
              message: "Cette organisation utilise déjà ses 3 sièges.",
            },
          }),
      })
    );

    expect(repaired).toEqual({
      ok: false,
      error: {
        code: "internal",
        fix: "Ajoute un siège dans la console.",
        message: "Cette organisation utilise déjà ses 3 sièges.",
      },
    });
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=snapshot"]);

    client.closeAll();
  });
});
