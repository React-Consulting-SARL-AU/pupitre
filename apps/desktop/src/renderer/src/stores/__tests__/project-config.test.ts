import { beforeEach, describe, expect, it } from "bun:test";
import type { ProjectUpdateParams } from "@pupitre/shared/agent-protocol/projects";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import type { AgentResponse } from "@shared/agent";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useProjectConfig } from "../project-config";
import { useSnapshot } from "../snapshot";
import { useTunnel } from "../tunnel";

/**
 * The configuration of a declared project, reopened and sent back. The agent
 * is a stub: what is under test is the patch the store builds, what it says
 * before sending it, and what it does with the answer.
 */

const SHOP: Project = {
  cmd: "bunx turbo run dev",
  dir: "shop",
  host: "127.0.0.1",
  name: "shop",
  path: "/home/dev/projects/shop",
  pkgmgr: "bun",
  port: 3300,
  repo: "https://github.com/ada/shop.git",
  routes: [
    { hostname: "shop.example.org", label: "web", port: 3300 },
    { hostname: "api-shop.example.org", label: "api", port: 3301 },
  ],
  state: "online",
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

beforeEach(() => {
  useProjectConfig.getState().close();
  useSnapshot.getState().forget();
  useTunnel.getState().forget();
});

describe("la configuration d'un projet rouverte", () => {
  it("s'ouvre sur ce que le projet est, et n'a rien à envoyer tant que rien ne change", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);

    const { draft } = useProjectConfig.getState();

    expect(draft.cmd).toBe("bunx turbo run dev");
    expect(
      draft.rows.map((row) => [row.label, row.port, row.web, row.whole])
    ).toEqual([
      ["web", 3300, "shop.example.org", true],
      ["api", 3301, "api-shop.example.org", true],
    ]);
    expect(useProjectConfig.getState().changed()).toBe(false);
    expect(useProjectConfig.getState().ready()).toBe(false);
    expect(useProjectConfig.getState().restarts()).toBe(false);
    expect(useProjectConfig.getState().dropped()).toEqual([]);
  });

  it("envoie la commande changée, dit qu'elle redémarre le projet, et rend le nom entier d'une route gardée", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().setCmd("bunx turbo run dev --filter=web...");

    expect(useProjectConfig.getState().restarts()).toBe(true);
    expect(useProjectConfig.getState().ready()).toBe(true);
    expect(useProjectConfig.getState().patch()).toEqual({
      cmd: "bunx turbo run dev --filter=web...",
      routes: [
        { hostname: "shop.example.org", label: "web", port: 3300 },
        { hostname: "api-shop.example.org", label: "api", port: 3301 },
      ],
    });
  });

  it("publie un second port en sous-domaine, et nomme les adresses qu'un retrait fait mourir", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().addRow();

    const added = useProjectConfig.getState().draft.rows[2];

    expect(added).toMatchObject({
      label: "docs",
      port: 3302,
      publish: true,
      web: "docs-shop",
    });
    expect(useProjectConfig.getState().patch().routes?.[2]).toEqual({
      label: "docs",
      port: 3302,
      subdomain: "docs-shop",
    });

    useProjectConfig.getState().removeRow(1);
    expect(useProjectConfig.getState().dropped()).toEqual([
      "api-shop.example.org",
    ]);

    useProjectConfig.getState().setRowPublish(0, false);
    expect(useProjectConfig.getState().dropped()).toEqual([
      "shop.example.org",
      "api-shop.example.org",
    ]);
  });

  it("refuse un port que l'autre projet tient, avant l'agent", () => {
    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().setRowPort(1, 3200);

    expect(useProjectConfig.getState().rowProblem(1)).toBe("portTaken");
    expect(useProjectConfig.getState().ready()).toBe(false);
  });

  it("enregistre, synchronise l'exposition, relit le snapshot et reprend le projet rendu", async () => {
    const { sent, synced } = quiet((params) => ({
      ok: true,
      result: {
        ...SHOP,
        cmd: params.patch.cmd ?? SHOP.cmd,
        routes: [
          { hostname: "boutique.example.org", label: "web", port: 3300 },
        ],
        state: "online",
      },
    }));

    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().removeRow(1);
    useProjectConfig.getState().generateRowWeb(0);
    useProjectConfig.getState().setRowWeb(0, "boutique");

    await useProjectConfig.getState().save("srv-1");

    expect(sent).toEqual([
      {
        name: "shop",
        patch: {
          routes: [{ label: "web", port: 3300, subdomain: "boutique" }],
        },
      },
    ]);
    expect(synced).toContain("tunnel.sync");
    expect(synced).toContain("snapshot");
    expect(useProjectConfig.getState().run).toMatchObject({
      name: "shop",
      status: "saved",
    });
    expect(
      useProjectConfig.getState().draft.rows.map((row) => row.web)
    ).toEqual(["boutique.example.org"]);
    expect(useProjectConfig.getState().changed()).toBe(false);
  });

  it("garde le refus de l'agent tel quel, et le draft avec", async () => {
    quiet(() => ({
      error: {
        code: "bad_request",
        fix: "Give a name under example.org.",
        message: "shop.elsewhere.org is not under this server's domain",
      },
      ok: false,
    }));

    useProjectConfig.getState().open(SHOP, SNAPSHOT.projects, true);
    useProjectConfig.getState().setRowWeb(0, "shop.elsewhere.org");

    await useProjectConfig.getState().save("srv-1");

    expect(useProjectConfig.getState().run).toMatchObject({
      error: {
        message: "shop.elsewhere.org is not under this server's domain",
      },
      status: "failed",
    });
    expect(useProjectConfig.getState().draft.rows[0]?.web).toBe(
      "shop.elsewhere.org"
    );
  });
});
