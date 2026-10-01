import { beforeEach, describe, expect, it } from "bun:test";
import type { ProjectUpdateParams } from "@pupitre/shared/agent-protocol/projects";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import type { AgentResponse } from "@shared/agent";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useProjectConfig } from "../project-config";
import { useSnapshot } from "../snapshot";
import { useTunnel } from "../tunnel";

const SHOP: Project = {
  boot: false,
  dir: "shop",
  name: "shop",
  path: "/home/dev/projects/shop",
  processes: [
    {
      cmd: "bunx turbo run dev",
      dir: ".",
      host: "127.0.0.1",
      id: "shop",
      path: "/home/dev/projects/shop",
      pkgmgr: "bun",
      port: 3300,
      routes: [
        { hostname: "shop.example.org", label: "web", port: 3300 },
        { hostname: "api-shop.example.org", label: "api", port: 3301 },
      ],
      state: "online",
    },
  ],
  repo: "https://github.com/ada/shop.git",
  state: "online",
};

const SHOP_PROCESS = {
  cmd: "bunx turbo run dev",
  dir: ".",
  host: "127.0.0.1" as const,
  id: "shop",
  install: "",
  pkgmgr: "bun" as const,
  port: 3300,
};

function quiet(
  answer: (params: ProjectUpdateParams) => AgentResponse<Project>
): { sent: ProjectUpdateParams[]; synced: string[] } {
  const sent: ProjectUpdateParams[] = [];
  const synced: string[] = [];

  stubPupitre({
    agentCall: (_server, cmd) => {
      synced.push(cmd);

      return Promise.resolve({
        ok: true,
        result:
          cmd === "snapshot"
            ? SNAPSHOT
            : {
                installed: true,
                provider: "cloudflare",
                routes: [],
                state: "running",
              },
      } as AgentResponse<unknown>);
    },
    syncTunnelRecords: () => Promise.resolve({ ok: true, result: 0 }),
    updateProject: (_server, params) => {
      sent.push(params);

      return Promise.resolve(answer(params));
    },
  });

  return { sent, synced };
}

function rows() {
  return useProjectConfig.getState().draft.processes[0]?.rows ?? [];
}

beforeEach(() => {
  useProjectConfig.getState().close();
  useSnapshot.getState().forget();
  useTunnel.getState().forget();
});

describe("a reopened project configuration", () => {
  it("opens on what the project is, and has nothing to send while nothing changes", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);

    const { draft } = useProjectConfig.getState();

    expect(draft.processes).toHaveLength(1);
    expect(draft.processes[0]?.cmd).toBe("bunx turbo run dev");
    expect(draft.processes[0]?.id).toBe("shop");
    expect(
      rows().map((row) => [row.label, row.port, row.web, row.whole])
    ).toEqual([
      ["web", 3300, "shop.example.org", true],
      ["api", 3301, "api-shop.example.org", true],
    ]);
    expect(useProjectConfig.getState().changed()).toBe(false);
    expect(useProjectConfig.getState().ready()).toBe(false);
    expect(useProjectConfig.getState().restarts()).toEqual([]);
    expect(useProjectConfig.getState().dropped()).toEqual([]);
  });

  it("sends start-with-server when it changes, and only that", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);

    expect(useProjectConfig.getState().draft.boot).toBe(false);

    useProjectConfig.getState().setBoot(true);

    expect(useProjectConfig.getState().changed()).toBe(true);
    expect(useProjectConfig.getState().ready()).toBe(true);
    expect(useProjectConfig.getState().restarts()).toEqual([]);
    expect(useProjectConfig.getState().patch().boot).toBe(true);

    useProjectConfig.getState().setBoot(false);

    expect(useProjectConfig.getState().patch().boot).toBeUndefined();
    expect(useProjectConfig.getState().changed()).toBe(false);
  });

  it("sends the project's protection when it changes, and the choice of a process that departs from it", () => {
    useProjectConfig
      .getState()
      .open({ ...SHOP, protected: true }, SNAPSHOT.projects, true);

    expect(useProjectConfig.getState().gated()).toBe(true);
    expect(useProjectConfig.getState().draft.protected).toBe(true);
    expect(
      useProjectConfig.getState().patch().processes?.[0]?.protected
    ).toBeUndefined();

    useProjectConfig.getState().setProtected(false);

    expect(useProjectConfig.getState().patch().protected).toBe(false);
    expect(useProjectConfig.getState().ready()).toBe(true);

    useProjectConfig.getState().setProtected(true);
    useProjectConfig.getState().setProcessAccess(0, "public");

    expect(useProjectConfig.getState().patch().protected).toBeUndefined();
    expect(useProjectConfig.getState().patch().processes?.[0]?.protected).toBe(
      false
    );
    expect(useProjectConfig.getState().changed()).toBe(true);

    useProjectConfig.getState().setProcessAccess(0, "project");

    expect(useProjectConfig.getState().changed()).toBe(false);
  });

  it("says nothing about protection to an agent that has no gate", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);

    useProjectConfig.getState().setProtected(false);

    expect(useProjectConfig.getState().gated()).toBe(false);
    expect(useProjectConfig.getState().patch().protected).toBeUndefined();
  });

  // The sent map replaces the project's, so it always goes whole.
  it("sends the pinned runtime versions when they change, the whole map", () => {
    useProjectConfig
      .getState()
      .open({ ...SHOP, runtimes: { node: "22" } }, SNAPSHOT.projects, true);

    expect(useProjectConfig.getState().draft.runtimes).toEqual({ node: "22" });
    expect(useProjectConfig.getState().changed()).toBe(false);

    useProjectConfig.getState().setRuntime("java", "17");

    expect(useProjectConfig.getState().changed()).toBe(true);
    expect(useProjectConfig.getState().ready()).toBe(true);
    expect(useProjectConfig.getState().restarts()).toEqual([]);
    expect(useProjectConfig.getState().patch().runtimes).toEqual({
      java: "17",
      node: "22",
    });

    useProjectConfig.getState().setRuntime("java", "");
    useProjectConfig.getState().setRuntime("node", "");

    expect(useProjectConfig.getState().patch().runtimes).toEqual({});
    expect(useProjectConfig.getState().changed()).toBe(true);

    useProjectConfig.getState().setRuntime("node", "22");

    expect(useProjectConfig.getState().patch().runtimes).toBeUndefined();
    expect(useProjectConfig.getState().changed()).toBe(false);
  });

  it("sends the changed command, says which process restarts, and returns the full name of a guarded route", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig
      .getState()
      .setProcessCmd(0, "bunx turbo run dev --filter=web...");

    expect(useProjectConfig.getState().restarts()).toEqual(["shop"]);
    expect(useProjectConfig.getState().ready()).toBe(true);
    expect(useProjectConfig.getState().patch()).toEqual({
      processes: [
        {
          ...SHOP_PROCESS,
          cmd: "bunx turbo run dev --filter=web...",
          routes: [
            { hostname: "shop.example.org", label: "web", port: 3300 },
            { hostname: "api-shop.example.org", label: "api", port: 3301 },
          ],
        },
      ],
    });
  });

  it("publishes a second port on a subdomain, and names the addresses a removal kills", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().addRow(0);

    expect(rows()[2]).toMatchObject({
      label: "docs",
      port: 3302,
      publish: true,
      web: "docs-shop",
    });
    expect(
      useProjectConfig.getState().patch().processes?.[0]?.routes[2]
    ).toEqual({
      label: "docs",
      port: 3302,
      subdomain: "docs-shop",
    });

    useProjectConfig.getState().removeRow(0, 1);
    expect(useProjectConfig.getState().dropped()).toEqual([
      "api-shop.example.org",
    ]);

    useProjectConfig.getState().setRowPublish(0, 0, false);
    expect(useProjectConfig.getState().dropped()).toEqual([
      "shop.example.org",
      "api-shop.example.org",
    ]);
  });

  it("refuses a port the other project holds, before the agent", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().setRowPort(0, 1, 3200);

    expect(useProjectConfig.getState().rowProblems(0)).toEqual([
      null,
      "portTaken",
    ]);
    expect(useProjectConfig.getState().ready()).toBe(false);
  });

  it("adds a second process in its own folder, without restarting the first, and refuses the same identifier twice", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().addProcess();

    const added = useProjectConfig.getState().draft.processes[1];

    expect(added).toMatchObject({ dir: "", id: "app", pkgmgr: "bun" });
    expect(added?.rows[0]?.port).toBe(3302);
    expect(added?.rows[0]?.web).toBe("web-shop");
    expect(added?.cmd).toBe("bun run dev --port 3302");
    expect(useProjectConfig.getState().processProblem(1)).toBeNull();

    useProjectConfig.getState().setProcessId(1, "client");
    useProjectConfig.getState().setProcessDir(1, "client");
    useProjectConfig.getState().setProcessPkgmgr(1, "pnpm");

    expect(useProjectConfig.getState().draft.processes[1]?.cmd).toBe(
      "pnpm dev --port 3302"
    );
    expect(useProjectConfig.getState().processProblem(1)).toBeNull();
    expect(useProjectConfig.getState().ready()).toBe(true);
    expect(useProjectConfig.getState().restarts()).toEqual([]);
    expect(useProjectConfig.getState().patch().processes?.[1]).toMatchObject({
      cmd: "pnpm dev --port 3302",
      dir: "client",
      id: "client",
      pkgmgr: "pnpm",
      port: 3302,
    });

    useProjectConfig.getState().setProcessId(1, "shop");
    expect(useProjectConfig.getState().processProblem(1)).toBe("idTaken");

    useProjectConfig.getState().setProcessDir(1, "../elsewhere");
    useProjectConfig.getState().setProcessId(1, "client");
    expect(useProjectConfig.getState().processProblem(1)).toBe("dir");

    useProjectConfig.getState().setRowPort(1, 0, 3300);
    useProjectConfig.getState().setProcessDir(1, "client");
    expect(useProjectConfig.getState().rowProblems(1)).toEqual(["portTaken"]);

    useProjectConfig.getState().removeProcess(1);
    expect(useProjectConfig.getState().draft.processes).toHaveLength(1);
    useProjectConfig.getState().removeProcess(0);
    expect(useProjectConfig.getState().draft.processes).toHaveLength(1);
  });

  it("saves, syncs the exposure, rereads the snapshot and takes up the returned project", async () => {
    const { sent, synced } = quiet((params) => ({
      ok: true,
      result: {
        ...SHOP,
        processes: [
          {
            ...SHOP.processes[0],
            cmd: params.patch.processes?.[0]?.cmd ?? "bunx turbo run dev",
            routes: [
              { hostname: "boutique.example.org", label: "web", port: 3300 },
            ],
          } as Project["processes"][number],
        ],
        state: "online",
      },
    }));

    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().removeRow(0, 1);
    useProjectConfig.getState().generateRowWeb(0, 0);
    useProjectConfig.getState().setRowWeb(0, 0, "boutique");

    await useProjectConfig.getState().save("srv-1");

    expect(sent).toEqual([
      {
        name: "shop",
        patch: {
          processes: [
            {
              ...SHOP_PROCESS,
              routes: [{ label: "web", port: 3300, subdomain: "boutique" }],
            },
          ],
        },
      },
    ]);
    expect(synced).toContain("tunnel.sync");
    expect(synced).toContain("snapshot");
    expect(useProjectConfig.getState().run).toMatchObject({
      name: "shop",
      status: "saved",
    });
    expect(rows().map((row) => row.web)).toEqual(["boutique.example.org"]);
    expect(useProjectConfig.getState().changed()).toBe(false);
  });

  it("keeps the agent's refusal as is, and the draft with it", async () => {
    quiet(() => ({
      error: {
        code: "bad_request",
        fix: "Give a name under example.org.",
        message: "shop.elsewhere.org is not under this server's domain",
      },
      ok: false,
    }));

    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().setRowWeb(0, 0, "shop.elsewhere.org");

    await useProjectConfig.getState().save("srv-1");

    expect(useProjectConfig.getState().run).toMatchObject({
      error: {
        message: "shop.elsewhere.org is not under this server's domain",
      },
      status: "failed",
    });
    expect(rows()[0]?.web).toBe("shop.elsewhere.org");
  });

  it("does not treat an old tunnel refusal as a failure when nothing was synced", async () => {
    const local: Project = {
      ...SHOP,
      processes: [
        {
          ...SHOP.processes[0],
          routes: [{ label: "web", port: 3300 }],
        } as Project["processes"][number],
      ],
    };
    const { synced } = quiet((params) => ({
      ok: true,
      result: { ...local, boot: params.patch.boot ?? false },
    }));

    useTunnel.setState({
      problem: {
        code: "internal",
        message: "un ancien refus, jamais effacé",
      },
    });

    useProjectConfig.getState().open(local, SNAPSHOT.projects, true);
    useProjectConfig.getState().setBoot(true);

    await useProjectConfig.getState().save("srv-1");

    expect(synced).not.toContain("tunnel.sync");
    expect(useProjectConfig.getState().run).toMatchObject({
      name: "shop",
      status: "saved",
    });
    expect(useProjectConfig.getState().project?.boot).toBe(true);
    expect(useProjectConfig.getState().draft.boot).toBe(true);
    expect(useProjectConfig.getState().changed()).toBe(false);
  });

  it("reports a sync refusal separately, without failing the save", async () => {
    stubPupitre({
      agentCall: (_server, cmd) =>
        Promise.resolve(
          cmd === "tunnel.sync"
            ? {
                error: {
                  code: "internal",
                  fix: "Reconnecte le compte Cloudflare.",
                  message: "le tunnel refuse",
                },
                ok: false,
              }
            : { ok: true, result: SNAPSHOT }
        ) as Promise<AgentResponse<unknown>>,
      updateProject: () =>
        Promise.resolve({
          ok: true,
          result: {
            ...SHOP,
            processes: [
              {
                ...SHOP.processes[0],
                routes: [
                  {
                    hostname: "boutique.example.org",
                    label: "web",
                    port: 3300,
                  },
                ],
              } as Project["processes"][number],
            ],
          },
        }),
    });

    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().removeRow(0, 1);
    useProjectConfig.getState().setRowWeb(0, 0, "boutique");

    await useProjectConfig.getState().save("srv-1");

    expect(useProjectConfig.getState().run).toMatchObject({
      status: "saved",
      sync: { fix: "Reconnecte le compte Cloudflare." },
    });
    expect(rows().map((row) => row.web)).toEqual(["boutique.example.org"]);
  });

  it("keeps the agent's caveats alongside a save that holds", async () => {
    quiet(() => ({
      ok: true,
      result: {
        ...SHOP,
        boot: true,
        warnings: ["shop : le démarrage a refusé, le processus reste arrêté"],
      },
    }));

    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().setBoot(true);

    await useProjectConfig.getState().save("srv-1");

    expect(useProjectConfig.getState().run).toMatchObject({
      status: "saved",
      warnings: ["shop : le démarrage a refusé, le processus reste arrêté"],
    });
    expect(useProjectConfig.getState().changed()).toBe(false);
  });
});
