import { describe, expect, it } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { AccountResponse, AccountState, BuildKind } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { Server } from "@shared/servers";
import type { Account, Enrollment } from "../account-run";
import type { AgentPayload } from "../agent-binary";
import { type EnrollmentDeps, prepareAgent } from "../enrollment-run";
import type { EnrollInput } from "../platform-client";

/**
 * The order APP-14 fixes: the usage right, then the enrolment, then the binary
 * the platform named. A packaged build has nothing to fall back on.
 */

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
};

function keyPair() {
  const pair = generateKeyPairSync("ed25519");
  const spki = pair.publicKey.export({ format: "der", type: "spki" });

  return {
    privateKey: pair.privateKey,
    publicKey: spki.subarray(SPKI_HEADER_BYTES).toString("base64"),
  };
}

function signedRelease(bytes: Uint8Array) {
  const { privateKey, publicKey } = keyPair();

  return {
    publicKey,
    release: {
      channel: "stable",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      signature: sign(null, bytes, privateKey).toString("base64"),
      url: "https://r2.pupitre.test/pupitred",
      version: "1.4.0",
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
}> = {}): EnrollmentDeps & { enrolled: EnrollInput[] } {
  const enrolled: EnrollInput[] = [];
  const account: Pick<Account, "guard" | "state" | "enroll" | "releaseBytes"> =
    {
      enroll: (input) => {
        enrolled.push(input);

        return Promise.resolve({
          ok: true,
          result: {
            release: release ?? {
              channel: "beta",
              sha256: "",
              signature: "",
              url: "",
              version: "0.0.0-dev",
            },
            serverId: "srv-platform-1",
          },
        } satisfies AccountResponse<Enrollment>);
      },
      guard: () =>
        granted
          ? {
              ok: true,
              result: {
                entitlement: "valid",
                source: "platform",
                status: "granted",
                validUntil: null,
              },
            }
          : {
              ok: false,
              error: {
                code: "entitlement_required",
                message: "Installer un serveur demande un compte Pupitre.",
                fix: "Connecte-toi depuis les réglages, ou ouvre la console : https://app.pupitre.test/dashboard",
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

  return { account, build, embedded, enrolled, releaseKey };
}

describe("la préparation de l'agent", () => {
  it("refuse un build de production sans droit d'usage, avec le lien vers la console", async () => {
    const answer = await prepareAgent(
      SERVER,
      "amd64",
      deps({ build: "production", granted: false })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "entitlement_required",
        fix: expect.stringContaining("https://app.pupitre.test/dashboard"),
      },
    });
  });

  it("enrôle le serveur avant d'envoyer quoi que ce soit", async () => {
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
        payload: { arch: "amd64", path: "pupitred 1.4.0" },
      },
    });
  });

  it("refuse un binaire dont la signature ne tient pas", async () => {
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

  it("garde le binaire du build local quand aucune version n'est publiée", async () => {
    const answer = await prepareAgent(SERVER, "amd64", deps());

    expect(answer).toMatchObject({
      ok: true,
      result: {
        enrollment: { release: { available: false } },
        payload: { sha256: "carried" },
      },
    });
  });

  it("n'a rien à envoyer en production quand aucune version n'est publiée", async () => {
    const answer = await prepareAgent(
      SERVER,
      "amd64",
      deps({ build: "production" })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { fix: expect.stringContaining("Publie une version") },
    });
  });

  it("laisse un build de développement sans compte pousser son propre binaire", async () => {
    const answer = await prepareAgent(SERVER, "amd64", deps({ device: null }));

    expect(answer).toMatchObject({
      ok: true,
      result: { enrollment: null, payload: { sha256: "carried" } },
    });
  });
});
