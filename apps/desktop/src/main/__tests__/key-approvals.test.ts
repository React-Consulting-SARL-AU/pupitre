import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  KEY_APPROVAL_NAMESPACE,
  type KeyApprovalSubmission,
  keyApprovalMessage,
  type PendingKeyApproval,
  publicKeyFingerprint,
} from "@pupitre/shared/keys";
import type { AccountResponse } from "@shared/account";
import type { KeyApprovalReceipt } from "@shared/key-approvals";
import { createAccount } from "../account-run";
import { createTokenVault } from "../account-vault";
import {
  type ApprovalSigner,
  createKeyApprovals,
  type KeyApprovalsDeps,
  sshKeygenSigner,
} from "../key-approvals-run";
import { createPlatformClient } from "../platform-client";
import { FAKE_KEY, fakePlatform, memorySealer } from "./fixtures/fake-platform";

const SSH_KEYGEN = !spawnSync("ssh-keygen", ["-?"]).error;

const SERVER_ID = "0b7c6a52-3f1e-4d2a-9c1b-2f8e4a6d9e10";

const NOW = new Date("2026-09-25T08:30:12.345Z");

let dir = "";
let deviceKeyPath = "";
let devicePublic = "";
let deviceFingerprint = "";
let otherPublic = "";
let otherFingerprint = "";

function keygen(name: string): string {
  const path = join(dir, name);

  execFileSync("ssh-keygen", [
    "-t",
    "ed25519",
    "-N",
    "",
    "-q",
    "-C",
    `pupitre ${name}`,
    "-f",
    path,
  ]);

  return path;
}

function bare(line: string): string {
  return line.trim().split(" ").slice(0, 2).join(" ");
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pupitre-approvals-"));

  if (!SSH_KEYGEN) {
    return;
  }

  deviceKeyPath = keygen("device");
  devicePublic = readFileSync(`${deviceKeyPath}.pub`, "utf8").trim();
  deviceFingerprint = (await publicKeyFingerprint(devicePublic)) ?? "";

  const other = keygen("other");

  otherPublic = bare(readFileSync(`${other}.pub`, "utf8"));
  otherFingerprint = (await publicKeyFingerprint(otherPublic)) ?? "";
});

afterAll(() => {
  rmSync(dir, { force: true, recursive: true });
});

function pending(
  overrides: Partial<PendingKeyApproval> = {}
): PendingKeyApproval {
  return {
    device: {
      fingerprint: otherFingerprint,
      id: "device-2",
      name: "ThinkPad",
      public_key: otherPublic,
    },
    reported_at: "2026-09-25T08:00:00.000Z",
    server: { id: SERVER_ID, name: "prod-1" },
    signers: [deviceFingerprint],
    user: { email: "grace@pupitre.studio", id: "user_grace", name: "Grace" },
    ...overrides,
  };
}

interface Harness {
  deps: KeyApprovalsDeps;
  submitted: KeyApprovalSubmission[];
  signed: { message: string; keyPath: string }[];
}

function harness({
  listed = [pending()],
  sign,
  approved,
  devicePublicKey = () => devicePublic,
}: {
  listed?: PendingKeyApproval[];
  sign?: ApprovalSigner;
  approved?: AccountResponse<KeyApprovalReceipt>;
  devicePublicKey?: () => string | null;
} = {}): Harness {
  const submitted: KeyApprovalSubmission[] = [];
  const signed: { message: string; keyPath: string }[] = [];

  return {
    deps: {
      account: {
        approveKey: (approval) => {
          submitted.push(approval);

          return Promise.resolve(
            approved ?? {
              ok: true,
              result: {
                device_id: approval.device_id,
                issued_at: approval.issued_at,
                server_id: approval.server_id,
                signer: approval.signer,
              },
            }
          );
        },
        keyApprovals: () => Promise.resolve({ ok: true, result: listed }),
      },
      deviceKeyPath: () => deviceKeyPath,
      devicePublicKey,
      now: () => NOW,
      sign:
        sign ??
        ((message, keyPath) => {
          signed.push({ keyPath, message });

          return Promise.resolve({
            ok: true,
            result:
              "-----BEGIN SSH SIGNATURE-----\nU1NIU0lH\n-----END SSH SIGNATURE-----\n",
          });
        }),
    },
    signed,
    submitted,
  };
}

describe.skipIf(!SSH_KEYGEN)("les demandes d'autorisation", () => {
  it("keeps only the requests this computer can sign", async () => {
    const mine = pending();
    const theirs = pending({
      device: { ...pending().device, id: "device-3" },
      signers: ["SHA256:someoneElse00000000000000000000000000000000"],
    });
    const approvals = createKeyApprovals(
      harness({ listed: [mine, theirs] }).deps
    );

    const answer = await approvals.list();

    expect(answer).toEqual({ ok: true, result: [mine] });
  });

  it("refuses to list without a device key on this computer", async () => {
    const approvals = createKeyApprovals(
      harness({ devicePublicKey: () => null }).deps
    );

    const answer = await approvals.list();

    expect(answer).toMatchObject({
      error: { phrase: { id: "refusal.keyApproval.noDeviceKey" } },
      ok: false,
    });
  });

  it("signs the exact bytes of the contract with the device key", async () => {
    const { deps, signed } = harness();
    const approvals = createKeyApprovals(deps);

    await approvals.list();
    await approvals.approve(SERVER_ID, "device-2");

    expect(signed).toEqual([
      {
        keyPath: deviceKeyPath,
        message: [
          "pupitre-key-approval-v1",
          `server_id:${SERVER_ID}`,
          `public_key:${otherPublic}`,
          "user_id:user_grace",
          "issued_at:2026-09-25T08:30:12Z",
          "",
        ].join("\n"),
      },
    ]);
  });

  it("sends the signed authorization, with this computer's fingerprint as signer", async () => {
    const { deps, submitted } = harness();
    const approvals = createKeyApprovals(deps);

    await approvals.list();
    const answer = await approvals.approve(SERVER_ID, "device-2");

    expect(answer).toEqual({
      ok: true,
      result: {
        device_id: "device-2",
        issued_at: "2026-09-25T08:30:12Z",
        server_id: SERVER_ID,
        signer: deviceFingerprint,
      },
    });
    expect(submitted).toEqual([
      {
        device_id: "device-2",
        issued_at: "2026-09-25T08:30:12Z",
        public_key: otherPublic,
        server_id: SERVER_ID,
        signature:
          "-----BEGIN SSH SIGNATURE-----\nU1NIU0lH\n-----END SSH SIGNATURE-----\n",
        signer: deviceFingerprint,
        user_id: "user_grace",
      },
    ]);
  });

  it("only signs a request the platform has just listed", async () => {
    const { deps, signed } = harness();
    const approvals = createKeyApprovals(deps);

    const before = await approvals.approve(SERVER_ID, "device-2");

    await approvals.list();
    const stranger = await approvals.approve(SERVER_ID, "device-9");

    for (const answer of [before, stranger]) {
      expect(answer).toMatchObject({
        error: { phrase: { id: "refusal.keyApproval.unknown" } },
        ok: false,
      });
    }
    expect(signed).toEqual([]);
  });

  it("does not sign a key whose displayed fingerprint lies", async () => {
    const lying = pending({
      device: { ...pending().device, fingerprint: deviceFingerprint },
    });
    const { deps, signed } = harness({ listed: [lying] });
    const approvals = createKeyApprovals(deps);

    await approvals.list();
    const answer = await approvals.approve(SERVER_ID, "device-2");

    expect(answer).toMatchObject({
      error: {
        phrase: {
          id: "refusal.keyApproval.mismatch",
          values: { device: "ThinkPad" },
        },
      },
      ok: false,
    });
    expect(signed).toEqual([]);
  });

  it("returns the platform's refusal with its fix", async () => {
    const approvals = createKeyApprovals(
      harness({
        approved: {
          error: {
            code: "key_approval_invalid",
            fix: "Sign again from a device prod-1 trusts.",
            message: "The signer is not trusted on this server.",
          },
          ok: false,
        },
      }).deps
    );

    await approvals.list();
    const answer = await approvals.approve(SERVER_ID, "device-2");

    expect(answer).toEqual({
      error: {
        code: "internal",
        fix: "Sign again from a device prod-1 trusts.",
        message: "The signer is not trusted on this server.",
      },
      ok: false,
    });
  });

  it("returns the signing failure without sending anything", async () => {
    const { deps, submitted } = harness({
      sign: sshKeygenSigner("pupitre-no-such-ssh-keygen"),
    });
    const approvals = createKeyApprovals(deps);

    await approvals.list();
    const answer = await approvals.approve(SERVER_ID, "device-2");

    expect(answer).toMatchObject({
      error: { phrase: { id: "refusal.keyApproval.sshKeygenMissing" } },
      ok: false,
    });
    expect(submitted).toEqual([]);
  });
});

describe.skipIf(!SSH_KEYGEN)("la signature par ssh-keygen", () => {
  it("produces an SSHSIG signature that ssh-keygen verifies", async () => {
    const message = keyApprovalMessage({
      issued_at: "2026-09-25T08:30:12Z",
      public_key: otherPublic,
      server_id: SERVER_ID,
      user_id: "user_grace",
    });

    const signed = await sshKeygenSigner()(message, deviceKeyPath);

    expect(signed.ok).toBe(true);

    const signature = join(dir, "approval.sig");
    const allowed = join(dir, "allowed_signers");

    writeFileSync(signature, signed.ok ? signed.result : "");
    writeFileSync(allowed, `approver ${bare(devicePublic)}\n`);

    const verified = execFileSync(
      "ssh-keygen",
      [
        "-Y",
        "verify",
        "-f",
        allowed,
        "-I",
        "approver",
        "-n",
        KEY_APPROVAL_NAMESPACE,
        "-s",
        signature,
      ],
      { input: message }
    ).toString();

    expect(verified).toContain("Good");
  });

  it("reports the failure when the key cannot be read", async () => {
    const signed = await sshKeygenSigner()("message\n", join(dir, "missing"));

    expect(signed).toMatchObject({
      error: { phrase: { id: "refusal.keyApproval.signFailed" } },
      ok: false,
    });
  });
});

describe("requests through the account", () => {
  it("refuses without a session, in the account's words", async () => {
    const account = createAccount({
      build: "production",
      deviceKey: () => Promise.resolve(FAKE_KEY),
      deviceName: () => "MacBook",
      now: () => NOW.getTime(),
      openUrl: () => undefined,
      platform: fakePlatform(),
      vault: createTokenVault({
        dir: mkdtempSync(join(dir, "vault-")),
        sealer: memorySealer,
      }),
      wait: () => Promise.resolve(),
    });

    const answer = await account.keyApprovals();

    expect(answer.ok).toBe(false);
  });
});

describe("the platform routes", () => {
  function recording(status: number, body: unknown) {
    const seen: { url: string; method: string; body: string | null }[] = [];
    const fetcher = ((input: string, init?: RequestInit) => {
      seen.push({
        body: typeof init?.body === "string" ? init.body : null,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
          status,
        })
      );
    }) as unknown as typeof fetch;

    return {
      platform: createPlatformClient({
        baseUrl: "https://app.pupitre.studio",
        fetch: fetcher,
      }),
      seen,
    };
  }

  it("reads the requests from the data envelope", async () => {
    const pending = {
      device: {
        fingerprint: `SHA256:${"a".repeat(43)}`,
        id: "dev-1",
        name: "MacBook",
        public_key:
          "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINIqIikYhGRpaqoJuvKifjn/NLVieWICV3MrBVyZO2Lj",
      },
      reported_at: "2026-09-19T03:15:00.000Z",
      server: { id: "srv-1", name: "vps" },
      signers: [],
      user: { email: "ada@example.org", id: "usr-1", name: "Ada" },
    };
    const { platform, seen } = recording(200, { data: [pending] });

    const answer = await platform.keyApprovals("jeton");

    expect(answer).toEqual({ ok: true, result: [pending] });
    expect(seen).toEqual([
      {
        body: null,
        method: "GET",
        url: "https://app.pupitre.studio/api/v1/me/key-approvals",
      },
    ]);
  });

  it("posts the authorization as is and returns the refusal with its fix", async () => {
    const { platform, seen } = recording(403, {
      error: {
        code: "forbidden",
        fix: "Ask an admin of the organization.",
        message: "This server is not yours to open.",
      },
    });
    const approval = {
      device_id: "device-2",
      issued_at: "2026-09-25T08:30:12Z",
      public_key: "ssh-ed25519 AAAA",
      server_id: SERVER_ID,
      signature: "sig",
      signer: "SHA256:x",
      user_id: "user_grace",
    };

    const answer = await platform.approveKey("jeton", approval);

    expect(answer).toEqual({
      error: {
        code: "forbidden",
        fix: "Ask an admin of the organization.",
        message: "This server is not yours to open.",
      },
      ok: false,
    });
    expect(seen[0]?.method).toBe("POST");
    expect(JSON.parse(seen[0]?.body ?? "null")).toEqual(approval);
  });
});
