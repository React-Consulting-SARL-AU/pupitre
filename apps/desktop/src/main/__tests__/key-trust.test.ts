import { describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { AgentResponse } from "@shared/agent";
import type { AgentClient } from "../agent-client";
import { enrolAgent, trustDevice } from "../install-run";

const DEVICE_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl pupitre device";

const BARE_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";

const SUMMARY = {
  release: { available: true, channel: "stable", version: "0.9.2" },
  serverId: "plt-1",
};

const GRANT = { platformUrl: "https://app.pupitre.test", token: "enr-1" };

interface Call {
  cmd: CommandName;
  params: unknown;
}

function client(
  answers: Partial<Record<CommandName, AgentResponse<unknown>>>
): { calls: Call[]; client: Pick<AgentClient, "request" | "close"> } {
  const calls: Call[] = [];

  return {
    calls,
    client: {
      close: () => undefined,
      request: ((_id: string, cmd: CommandName, params: unknown) => {
        calls.push({ cmd, params });

        return Promise.resolve(
          answers[cmd] ?? { ok: true, result: { keys: [] } }
        );
      }) as AgentClient["request"],
    },
  };
}

const ENROLLED: AgentResponse<unknown> = {
  ok: true,
  result: { enrolled: true, license: "valid" },
};

describe("the device key placed after enrolment", () => {
  it("places the device's bare key as signer", async () => {
    const agent = client({ enroll: ENROLLED });

    const answer = await enrolAgent("srv-1", SUMMARY, {
      client: agent.client,
      deviceKey: () => DEVICE_KEY,
      enrollment: () => GRANT,
      identity: () => null,
    });

    expect(answer).toEqual(ENROLLED as never);
    expect(agent.calls).toEqual([
      {
        cmd: "enroll",
        params: { platform_url: GRANT.platformUrl, secrets_stdin: true },
      },
      { cmd: "keys.trust", params: { public_key: BARE_KEY } },
    ]);
  });

  it("also places it when the agent already carried its identity", async () => {
    const agent = client({});

    const answer = await enrolAgent("srv-1", SUMMARY, {
      client: agent.client,
      deviceKey: () => DEVICE_KEY,
      enrollment: () => GRANT,
      identity: () => "plt-1",
    });

    expect(answer).toEqual({ ok: true, result: null });
    expect(agent.calls.map((call) => call.cmd)).toEqual(["keys.trust"]);
  });

  it("places nothing without a device, like a development build without an account", async () => {
    const agent = client({ enroll: ENROLLED });

    const answer = await enrolAgent("srv-1", SUMMARY, {
      client: agent.client,
      deviceKey: () => null,
      enrollment: () => GRANT,
      identity: () => null,
    });

    expect(answer.ok).toBe(true);
    expect(agent.calls.map((call) => call.cmd)).toEqual(["enroll"]);
  });

  it("places nothing when nothing was enrolled", async () => {
    const agent = client({});

    const answer = await enrolAgent("srv-1", null, {
      client: agent.client,
      deviceKey: () => DEVICE_KEY,
      enrollment: () => GRANT,
      identity: () => null,
    });

    expect(answer).toEqual({ ok: true, result: null });
    expect(agent.calls).toEqual([]);
  });

  it("moves on past an agent too old to know keys.trust", async () => {
    const agent = client({
      "keys.trust": {
        error: { code: "unknown_command", message: "keys.trust" },
        ok: false,
      },
    });

    const answer = await trustDevice("srv-1", {
      client: agent.client,
      deviceKey: () => DEVICE_KEY,
    });

    expect(answer).toEqual({ ok: true, result: null });
  });

  it("returns the keys.trust refusal, without which no one could authorize another device", async () => {
    const refusal: AgentResponse<unknown> = {
      error: {
        code: "bad_request",
        fix: "Send the key as `type base64`.",
        message: "public_key is not an approved key",
      },
      ok: false,
    };
    const agent = client({ enroll: ENROLLED, "keys.trust": refusal });

    const answer = await enrolAgent("srv-1", SUMMARY, {
      client: agent.client,
      deviceKey: () => DEVICE_KEY,
      enrollment: () => GRANT,
      identity: () => null,
    });

    expect(answer).toEqual(refusal as never);
  });
});
