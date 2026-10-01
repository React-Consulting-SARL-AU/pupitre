import { afterEach, describe, expect, it } from "bun:test";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { Enrollment } from "../account-run";
import { type AgentClient, createAgentClient } from "../agent-client";
import { type ReenrollDeps, runReenroll } from "../reenroll-run";
import { usageError } from "../usage-guard";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";

const PLATFORM = "https://app.pupitre.test/api/v1";

const TOKEN = "enr-jeton-tres-secret-app29";

const PLATFORM_SERVER = "srv-platform-1";

const GRANTED: AccountResponse<UsageRight> = {
  ok: true,
  result: {
    license: "valid",
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
    code: "license_required",
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

/** Burnt on first take, like `takeEnrollmentToken`: a replay cannot resend an exchange already closed. */
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

describe("a server restricted to the revoked token", () => {
  it("becomes valid again after the action, without going through the console", async () => {
    const client = agent(RESTRICTED);

    const before = await client.request(SERVER, "project.down", {
      name: "api",
    });

    expect(before).toMatchObject({
      ok: false,
      error: {
        code: "license_required",
        message: "licence requise : ce serveur est en mode restreint",
      },
    });

    const repaired = await runReenroll(SERVER, deps(client));

    expect(repaired).toEqual({
      ok: true,
      result: {
        enrolled: true,
        license: "valid",
        synced_at: "2026-09-05T10:00:00Z",
      },
    });

    const snapshot = await client.request(SERVER, "snapshot");

    expect(snapshot.ok && snapshot.result.license).toBe("valid");

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

  // `enroll` rides the privileged session since it rewrites where the server reports.
  it("only asks the server for what it takes to read the machine and redo the exchange", async () => {
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

  it("enrols on the architecture the machine declared, without a probe", async () => {
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

describe("the enrolment token", () => {
  it("appears in no params, no journal, no result", async () => {
    const client = agent(RESTRICTED);
    const held = vault();

    const repaired = await runReenroll(SERVER, deps(client, held));

    const written = fake?.written() ?? [];
    const requests = written.filter((line) => line.includes('"cmd"'));
    const enrol = requests.find((line) => line.includes('"enroll"')) ?? "";

    // A request carrying the token would already be written by the time the transcript refuses it.
    for (const line of requests) {
      expect(line).not.toContain(TOKEN);
    }

    expect(written.filter((line) => line.includes(TOKEN))).toEqual([
      JSON.stringify({ enrollment_token: TOKEN }),
    ]);

    expect(fake?.trace().join("\n")).not.toContain(TOKEN);
    expect(JSON.stringify(repaired)).not.toContain(TOKEN);

    expect(enrol).toContain(PLATFORM);
    expect(enrol).toContain('"secrets_stdin":true');
    expect(repaired.ok).toBe(true);
    expect(held.taken).toEqual([TOKEN]);

    client.closeAll();
  });

  it("sends nothing to the server when the platform granted no token", async () => {
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

describe("an account without a right of use", () => {
  it("refuses the repair in the account's words, without touching the platform", async () => {
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
        code: "license_required",
        fix: ABSENT_FIX,
        message: "Installer un serveur demande un compte Pupitre.",
      },
    });
    expect(asked).toBe(0);
    expect(fake?.started()).toBe(0);
    expect(fake?.written()).toEqual([]);
  });

  it("agrees with the channel guard, which treats enroll like any mutating command", async () => {
    const client = agent(RESTRICTED, ABSENT);

    const refused = await client.request(SERVER, "enroll", {
      platform_url: PLATFORM,
      secrets_stdin: true,
    });

    expect(refused).toMatchObject({
      ok: false,
      error: { code: "license_required" },
    });
    expect(fake?.started()).toBe(0);
  });

  it("returns the platform's refusal as is when it is the one refusing", async () => {
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
