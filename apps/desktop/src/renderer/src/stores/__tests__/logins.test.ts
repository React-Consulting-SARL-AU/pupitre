import { beforeEach, describe, expect, it } from "bun:test";
import type { ServiceDetail } from "@shared/services";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useLogins } from "../logins";

const SERVER = "srv-1";

function detail(id: string, login?: ServiceDetail["login"]): ServiceDetail {
  return {
    configured: true,
    credentials: [],
    id,
    name: id,
    state: "running",
    ...(login ? { login } : {}),
  };
}

beforeEach(() => {
  useLogins.getState().forget();
});

describe("the accounts of running services", () => {
  it("keeps what each CLI says about its account, and nothing for a module without an account", async () => {
    stubPupitre({
      serviceDetail: (_server, moduleId) =>
        Promise.resolve({
          ok: true,
          result:
            moduleId === "ai.claude"
              ? detail(moduleId, {
                  account: "jordan@example.org",
                  state: "signed_in",
                })
              : detail(moduleId),
        }),
    });

    await useLogins.getState().read(SERVER, ["ai.claude", "db.postgres"]);

    expect(useLogins.getState()).toMatchObject({
      answers: {
        "ai.claude": {
          login: { account: "jordan@example.org", state: "signed_in" },
          status: "answered",
        },
        "db.postgres": { login: null, status: "answered" },
      },
      serverId: SERVER,
    });
  });

  it("keeps the agent's refusal as is", async () => {
    stubPupitre({
      serviceDetail: () =>
        Promise.resolve({
          error: {
            code: "service_not_found",
            fix: "Relisez la liste.",
            message: "Ce module n'est pas installé.",
          },
          ok: false,
        }),
    });

    await useLogins.getState().read(SERVER, ["ai.codex"]);

    expect(useLogins.getState().answers["ai.codex"]).toMatchObject({
      error: { fix: "Relisez la liste." },
      status: "failed",
    });
  });

  it("shows the previous response while it asks again, except on another server", async () => {
    let asked = 0;

    stubPupitre({
      serviceDetail: (_server, moduleId) =>
        new Promise((resolve) => {
          asked += 1;
          setTimeout(
            () =>
              resolve({
                ok: true,
                result: detail(moduleId, { state: "signed_out" }),
              }),
            5
          );
        }),
    });

    await useLogins.getState().read(SERVER, ["ai.claude"]);

    const again = useLogins.getState().read(SERVER, ["ai.claude"]);

    expect(useLogins.getState().answers["ai.claude"]).toMatchObject({
      status: "answered",
    });
    await again;

    const elsewhere = useLogins.getState().read("srv-2", ["ai.claude"]);

    expect(useLogins.getState().answers["ai.claude"]).toEqual({
      status: "asking",
    });
    await elsewhere;

    expect(asked).toBe(3);
    expect(useLogins.getState().serverId).toBe("srv-2");
  });

  it("discards a response that arrived after switching to another server", async () => {
    stubPupitre({
      serviceDetail: (_server, moduleId) =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                result: detail(moduleId, { state: "signed_in" }),
              }),
            5
          );
        }),
    });

    const slow = useLogins.getState().read(SERVER, ["ai.claude"]);

    useLogins.getState().forget();
    await slow;

    expect(useLogins.getState()).toEqual({
      answers: {},
      forget: expect.any(Function),
      read: expect.any(Function),
      serverId: null,
    });
  });

  it("yields to a more recent read of the same machine", async () => {
    const asked: string[] = [];
    const waiting: (() => void)[] = [];

    stubPupitre({
      serviceDetail: (_server, moduleId) => {
        asked.push(moduleId);

        return new Promise((resolve) => {
          waiting.push(() => resolve({ ok: true, result: detail(moduleId) }));
        });
      },
    });

    const first = useLogins
      .getState()
      .read(SERVER, ["ai.claude", "db.postgres", "ai.codex"]);
    const second = useLogins.getState().read(SERVER, ["ai.claude", "ai.codex"]);

    while (waiting.length > 0) {
      waiting.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all([first, second]);

    expect(asked.filter((id) => id === "db.postgres")).toEqual([]);
    expect(asked.filter((id) => id === "ai.codex")).toHaveLength(1);
    expect(useLogins.getState().answers["ai.codex"]).toMatchObject({
      status: "answered",
    });
  });
});
