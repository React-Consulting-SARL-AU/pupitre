import { beforeEach, describe, expect, it } from "bun:test";
import type { PendingKeyApproval } from "@pupitre/shared/keys";
import type { AgentError } from "@shared/agent";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useKeyApprovals } from "../key-approvals";

const APPROVAL: PendingKeyApproval = {
  device: {
    fingerprint: "SHA256:thinkpad000000000000000000000000000000000000",
    id: "device-2",
    name: "ThinkPad",
    public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0",
  },
  reported_at: "2026-09-25T08:00:00.000Z",
  server: { id: "srv-1", name: "prod-1" },
  signers: ["SHA256:mac"],
  user: { email: "grace@pupitre.studio", id: "user_grace", name: "Grace" },
};

const REFUSED: AgentError = {
  code: "internal",
  fix: "Sign again from a device prod-1 trusts.",
  message: "The signer is not trusted on this server.",
};

beforeEach(() => {
  useKeyApprovals.getState().forget();
});

describe("authorisation requests", () => {
  it("reads the requests this computer can sign", async () => {
    stubPupitre({
      keyApprovals: () => Promise.resolve({ ok: true, result: [APPROVAL] }),
    });

    await useKeyApprovals.getState().read();

    expect(useKeyApprovals.getState().state).toEqual({
      approvals: [APPROVAL],
      status: "ready",
    });
  });

  it("keeps the read refusal as is", async () => {
    stubPupitre({
      keyApprovals: () => Promise.resolve({ error: REFUSED, ok: false }),
    });

    await useKeyApprovals.getState().read();

    expect(useKeyApprovals.getState().state).toEqual({
      error: REFUSED,
      status: "failed",
    });
  });

  it("names only the server and the device to the main process, and marks the row authorised", async () => {
    const named: string[][] = [];
    const whileSigning: unknown[] = [];

    stubPupitre({
      approveKey: (serverId, deviceId) => {
        named.push([serverId, deviceId]);
        whileSigning.push(
          useKeyApprovals.getState().progress["srv-1:device-2"]
        );

        return Promise.resolve({
          ok: true,
          result: {
            device_id: deviceId,
            issued_at: "2026-09-25T08:30:12Z",
            server_id: serverId,
            signer: "SHA256:mac",
          },
        });
      },
    });

    await useKeyApprovals.getState().approve(APPROVAL);

    expect(named).toEqual([["srv-1", "device-2"]]);
    expect(whileSigning).toEqual([{ status: "signing" }]);
    expect(useKeyApprovals.getState().progress).toEqual({
      "srv-1:device-2": { status: "allowed" },
    });
  });

  it("puts the refusal under the refused row only", async () => {
    const other = { ...APPROVAL, device: { ...APPROVAL.device, id: "d-3" } };

    stubPupitre({
      approveKey: (_serverId, deviceId) =>
        Promise.resolve(
          deviceId === "device-2"
            ? { error: REFUSED, ok: false }
            : {
                ok: true,
                result: {
                  device_id: deviceId,
                  issued_at: "2026-09-25T08:30:12Z",
                  server_id: "srv-1",
                  signer: "SHA256:mac",
                },
              }
        ),
    });

    await useKeyApprovals.getState().approve(APPROVAL);
    await useKeyApprovals.getState().approve(other);

    expect(useKeyApprovals.getState().progress).toEqual({
      "srv-1:d-3": { status: "allowed" },
      "srv-1:device-2": { error: REFUSED, status: "refused" },
    });
  });
});
