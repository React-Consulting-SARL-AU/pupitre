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

describe("les comptes des services en marche", () => {
  it("garde ce que chaque CLI dit de son compte, et rien pour un module sans compte", async () => {
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

  it("garde le refus de l'agent tel quel", async () => {
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

  it("montre la réponse précédente pendant qu'il redemande, sauf sur un autre serveur", async () => {
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

  it("jette une réponse arrivée après le passage à un autre serveur", async () => {
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

  it("cède la place à une lecture plus récente de la même machine", async () => {
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
