import { afterEach, describe, expect, it } from "bun:test";
import type { PendingKeyApproval } from "@pupitre/shared/keys";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount } from "../../__tests__/dom";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useKeyApprovals } from "../../stores/key-approvals";
import { AccountKeyApprovalRow } from "../account/account-key-approval-row";
import { AccountKeyApprovals } from "../account/account-key-approvals";

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

const approve = () => Promise.resolve();

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

afterEach(() => {
  useKeyApprovals.getState().forget();
});

describe("the devices to authorize", () => {
  it("names the device, the person and the server, with the gesture that signs", () => {
    const html = renderToStaticMarkup(
      <AccountKeyApprovalRow
        approval={APPROVAL}
        onApprove={approve}
        progress={undefined}
      />
    );

    expect(text(html)).toContain("Autoriser ThinkPad de Grace sur prod-1");
    expect(html).toContain("<button");
    expect(html).toContain(APPROVAL.device.fingerprint);
  });

  it("replaces the gesture with what it did, once the authorization is accepted", () => {
    const html = renderToStaticMarkup(
      <AccountKeyApprovalRow
        approval={APPROVAL}
        onApprove={approve}
        progress={{ status: "allowed" }}
      />
    );

    expect(html).not.toContain("<button");
    expect(text(html)).toContain(
      "Autorisé : prod-1 admet la clé de ThinkPad à sa prochaine synchronisation."
    );
  });

  it("puts the refusal and its fix under the row", () => {
    const html = text(
      renderToStaticMarkup(
        <AccountKeyApprovalRow
          approval={APPROVAL}
          onApprove={approve}
          progress={{
            error: {
              code: "internal",
              message: "ssh-keygen",
              phrase: { id: "refusal.keyApproval.sshKeygenMissing" },
            },
            status: "refused",
          }}
        />
      )
    );

    expect(html).toContain("ssh-keygen est introuvable sur cet ordinateur.");
    expect(html).toContain("Installez OpenSSH");
  });

  it("shows nothing to a computer nobody is waiting for", async () => {
    stubPupitre({
      keyApprovals: () => Promise.resolve({ ok: true, result: [] }),
    });
    const empty = await act(() => mount(<AccountKeyApprovals />));
    const emptyHtml = empty.container.innerHTML;

    empty.unmount();

    stubPupitre({
      keyApprovals: () =>
        Promise.resolve({
          error: { code: "internal", message: "not_found" },
          ok: false,
        }),
    });
    const failed = await act(() => mount(<AccountKeyApprovals />));
    const failedHtml = failed.container.innerHTML;

    failed.unmount();

    expect(emptyHtml).toBe("");
    expect(failedHtml).toBe("");
  });

  it("reads the requests on open and signs on a click", async () => {
    const named: string[][] = [];

    stubPupitre({
      approveKey: (serverId, deviceId) => {
        named.push([serverId, deviceId]);

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
      keyApprovals: () => Promise.resolve({ ok: true, result: [APPROVAL] }),
    });

    const view = await act(() => mount(<AccountKeyApprovals />));
    const before = view.container.textContent ?? "";

    await view.click(view.container.querySelector("button"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const after = view.container.textContent ?? "";

    view.unmount();

    expect(before).toContain("Appareils à autoriser");
    expect(before).toContain("Autoriser ThinkPad de Grace sur prod-1");
    expect(named).toEqual([["srv-1", "device-2"]]);
    expect(after).toContain("Autorisé : prod-1 admet la clé de ThinkPad");
  });
});
