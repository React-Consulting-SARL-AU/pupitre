import { describe, expect, it } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { AccountResponse, AccountState, BuildKind } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { Server } from "@shared/servers";
import type { Account, Enrollment } from "../account-run";
import type { AgentPayload } from "../agent-binary";
import { signedMessage } from "../agent-release";
import { type EnrollmentDeps, prepareAgent } from "../enrollment-run";
import type { EnrollInput } from "../platform-client";

const SPKI_HEADER_BYTES = 12;

const BINARY = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 9, 9, 9]);

const SERVER: Server = {
  host: "vps.test",
  hostFingerprint: "SHA256:host",
  id: "srv-local",
  name: "vps",
  origin: "app",
  port: 22,
  user: "root",
};

const CARRIED: AgentPayload = {
  arch: "amd64",
  bytes: 3,
  content: Buffer.from([1, 2, 3]),
  path: "/resources/agent/pupitred-linux-amd64",
  sha256: "carried",
  signature: null,
  version: "0.0.0-unreleased",
};

function keyPair() {
  const pair = generateKeyPairSync("ed25519");
  const spki = pair.publicKey.export({ format: "der", type: "spki" });

  return {
    privateKey: pair.privateKey,
    publicKey: spki.subarray(SPKI_HEADER_BYTES).toString("base64"),
  };
}

/** The signature binds the fingerprint to the published version and architecture, never the bytes alone. */
function signedRelease(bytes: Uint8Array, arch = "amd64") {
  const { privateKey, publicKey } = keyPair();
  const version = "1.4.0";
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return {
    publicKey,
    release: {
      channel: "stable",
      sha256,
      signature: sign(
        null,
        signedMessage(version, arch, sha256),
        privateKey
      ).toString("base64"),
      url: "https://r2.pupitre.test/pupitred",
      version,
    },
  };
}

function deps({
  build = "development" as BuildKind,
  device = { fingerprint: "f", id: "device-1", name: "Mac", publicKey: "k" },
  granted = true,
  release,
  bytes = BINARY,
  releaseKey = "",
  embedded = () => ({ ok: true as const, result: CARRIED }),
}: Partial<{
  build: BuildKind;
  device: AccountState["device"];
  granted: boolean;
  release: Enrollment["release"];
  bytes: Uint8Array;
  releaseKey: string;
  embedded: () => AgentResponse<AgentPayload>;
}> = {}): EnrollmentDeps & {
  enrolled: EnrollInput[];
  bound: { serverId: string; platformServerId: string }[];
  spend: (serverId: string) => void;
} {
  const enrolled: EnrollInput[] = [];
  const bound: { serverId: string; platformServerId: string }[] = [];
  const held = new Map<string, Enrollment>();
  const account: Pick<
    Account,
    "guard" | "state" | "enroll" | "releaseBytes" | "heldEnrollment"
  > = {
    heldEnrollment: (serverId) => held.get(serverId) ?? null,
    enroll: (input) => {
      enrolled.push(input);

      const enrollment: Enrollment = {
        release: release ?? {
          channel: "beta",
          sha256: "",
          signature: "",
          url: "",
          version: "0.0.0-dev",
        },
        serverId: "srv-platform-1",
      };

      held.set(enrollment.serverId, enrollment);

      return Promise.resolve({
        ok: true,
        result: enrollment,
      } satisfies AccountResponse<Enrollment>);
    },
    guard: () =>
      granted
        ? {
            ok: true,
            result: {
              license: "valid",
              source: "platform",
              status: "granted",
              validUntil: null,
            },
          }
        : {
            ok: false,
            error: {
              code: "license_required",
              message: "refusal.account.required",
              phrase: {
                id: "refusal.account.required",
                values: { console: "https://app.pupitre.test/dashboard" },
              },
            },
          },
    releaseBytes: () => Promise.resolve({ ok: true, result: bytes }),
    state: () =>
      ({
        build,
        checkedAt: null,
        consoleUrl: "https://app.pupitre.test/dashboard",
        device,
        identity: null,
        refusal: null,
        sealed: true,
        usage: {
          consoleUrl: "https://app.pupitre.test/dashboard",
          status: "absent",
        },
      }) satisfies AccountState,
  };

  return {
    account,
    bind: (serverId, platformServerId) => {
      bound.push({ platformServerId, serverId });
    },
    bound,
    build,
    embedded,
    enrolled,
    hostFingerprint: (server) =>
      Promise.resolve(server.hostFingerprint ?? null),
    releaseKey,
    spend: (serverId) => {
      held.delete(serverId);
    },
  };
}

describe("agent preparation", () => {
  it("refuses a production build without a right of use, with the link to the console", async () => {
    const answer = await prepareAgent(
      SERVER,
      "amd64",
      deps({ build: "production", granted: false })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "license_required",
        phrase: {
          id: "refusal.account.required",
          values: { console: "https://app.pupitre.test/dashboard" },
        },
      },
    });
  });

  it("names only the Ed25519 fingerprint to the platform, which the agent will declare at the exchange", async () => {
    const signed = signedRelease(BINARY);
    const ready = deps({
      release: signed.release,
      releaseKey: signed.publicKey,
    });

    await prepareAgent(SERVER, "amd64", {
      ...ready,
      hostFingerprint: () => Promise.resolve(null),
    });

    expect(ready.enrolled[0]).not.toHaveProperty("fingerprint");
  });

  it("enrols the server before sending anything", async () => {
    const signed = signedRelease(BINARY);
    const ready = deps({
      release: signed.release,
      releaseKey: signed.publicKey,
    });

    const answer = await prepareAgent(SERVER, "amd64", ready);

    expect(ready.enrolled[0]).toEqual({
      device_id: "device-1",
      fingerprint: "SHA256:host",
      host: "vps.test",
      port: 22,
      probe: { arch: "amd64" },
      ssh_user: "root",
    });
    expect(answer).toMatchObject({
      ok: true,
      result: {
        enrollment: {
          release: { available: true, version: "1.4.0" },
          serverId: "srv-platform-1",
        },
        payload: {
          arch: "amd64",
          path: "pupitred 1.4.0",
          signature: signed.release.signature,
          version: "1.4.0",
        },
      },
    });
  });

  // Once the token has left for the agent, a new attempt enrols anew.
  it("reuses the enrolment the server still holds rather than buying another", async () => {
    const ready = deps();
    const granted: Server = {
      ...SERVER,
      grant: {
        adopted: false,
        id: "srv-platform-1",
        keyReady: false,
        listed: true,
        opened: false,
        status: "enrolling",
      },
    };

    const first = await prepareAgent(granted, "amd64", ready);
    const second = await prepareAgent(granted, "amd64", ready);

    expect(first.ok && second.ok).toBe(true);
    expect(ready.enrolled).toHaveLength(1);
    expect(second.ok ? second.result.enrollment?.serverId : null).toBe(
      "srv-platform-1"
    );

    ready.spend("srv-platform-1");

    await prepareAgent(granted, "amd64", ready);

    expect(ready.enrolled).toHaveLength(2);
  });

  it("enrols a server whose identity no longer holds an enrolment", async () => {
    const ready = deps();
    const granted: Server = {
      ...SERVER,
      grant: {
        adopted: true,
        id: "srv-platform-9",
        keyReady: true,
        listed: true,
        opened: true,
        status: "active",
      },
    };

    await prepareAgent(granted, "amd64", ready);

    expect(ready.enrolled).toHaveLength(1);
  });

  it("writes to the local server the identity the platform gives it", async () => {
    const ready = deps();

    await prepareAgent(SERVER, "amd64", ready);

    expect(ready.bound).toEqual([
      { platformServerId: "srv-platform-1", serverId: "srv-local" },
    ]);
  });

  it("refuses a binary whose signature does not hold", async () => {
    const signed = signedRelease(BINARY);
    const other = keyPair();

    const answer = await prepareAgent(
      SERVER,
      "amd64",
      deps({ release: signed.release, releaseKey: other.publicKey })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "bad_signature" },
    });
  });

  it("keeps the local build's binary when no version is published", async () => {
    const answer = await prepareAgent(SERVER, "amd64", deps());

    expect(answer).toMatchObject({
      ok: true,
      result: {
        enrollment: { release: { available: false } },
        payload: { sha256: "carried" },
      },
    });
  });

  it("has nothing to send in production when no version is published", async () => {
    const answer = await prepareAgent(
      SERVER,
      "amd64",
      deps({ build: "production" })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { phrase: { id: "refusal.release.none" } },
    });
  });

  it("lets a development build without an account push its own binary", async () => {
    const answer = await prepareAgent(SERVER, "amd64", deps({ device: null }));

    expect(answer).toMatchObject({
      ok: true,
      result: { enrollment: null, payload: { sha256: "carried" } },
    });
  });
});
