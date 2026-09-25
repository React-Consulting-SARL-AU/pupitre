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

describe("les demandes d'autorisation", () => {
  it("lit les demandes que cet ordinateur peut signer", async () => {
    stubPupitre({
      keyApprovals: () => Promise.resolve({ ok: true, result: [APPROVAL] }),
    });

    await useKeyApprovals.getState().read();

    expect(useKeyApprovals.getState().state).toEqual({
      approvals: [APPROVAL],
      status: "ready",
    });
  });

  it("garde le refus de la lecture tel quel", async () => {
    stubPupitre({
      keyApprovals: () => Promise.resolve({ error: REFUSED, ok: false }),
    });

    await useKeyApprovals.getState().read();

    expect(useKeyApprovals.getState().state).toEqual({
      error: REFUSED,
      status: "failed",
    });
  });

  it("ne nomme au main que le serveur et l'appareil, et marque la ligne autorisée", async () => {
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

  it("pose le refus sous la ligne refusée seulement", async () => {
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
