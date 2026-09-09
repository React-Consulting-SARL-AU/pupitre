import { describe, expect, it } from "bun:test";
import type { TunnelRoute } from "@pupitre/shared/agent-protocol/secrets";
import type { CloudflareConnection, CloudflareZone } from "@shared/cloudflare";
import type { CloudflareApi, DnsRecord } from "../cloudflare-api";
import {
  CLOUDFLARE_EXPOSURE,
  dropRecord,
  dropTunnel,
  managedValues,
  type ServerExposure,
  syncRecords,
  type TunnelDeps,
} from "../tunnel-run";

const CONNECTION: CloudflareConnection = {
  accountId: "acc-1234",
  accountName: "Flymate",
};

const ZONE: CloudflareZone = { id: "zone-1234", name: "flymate.dev" };

interface Harness {
  api: CloudflareApi;
  deps: TunnelDeps;
  calls: string[];
  records: Map<string, DnsRecord>;
}

function harness({
  connected = true,
  exposure = null,
  orphan = null,
  gone = [],
  zones = [ZONE],
  records = new Map<string, DnsRecord>(),
}: {
  connected?: boolean;
  /** What the server itself says it runs, which is the only record of it. */
  exposure?: ServerExposure | null;
  orphan?: string | null;
  /** The tunnels the account has lost since the server was told about them. */
  gone?: string[];
  zones?: CloudflareZone[];
  records?: Map<string, DnsRecord>;
} = {}): Harness {
  const calls: string[] = [];
  let created = 0;

  const api: CloudflareApi = {
    createRecord(zoneId, fqdn, content) {
      calls.push(`createRecord ${zoneId} ${fqdn}`);
      records.set(fqdn, { content, id: `r-${String(records.size + 1)}` });

      return Promise.resolve();
    },
    createTunnel(name) {
      calls.push(`createTunnel ${name}`);
      created += 1;

      return Promise.resolve(`t-${String(created)}`);
    },
    deleteRecord(zoneId, id) {
      calls.push(`deleteRecord ${zoneId} ${id}`);

      for (const [fqdn, record] of records) {
        if (record.id === id) {
          records.delete(fqdn);
        }
      }

      return Promise.resolve();
    },
    deleteTunnel(id) {
      calls.push(`deleteTunnel ${id}`);

      return Promise.resolve();
    },
    findRecord(_zoneId, fqdn) {
      return Promise.resolve(records.get(fqdn) ?? null);
    },
    findTunnel(name) {
      calls.push(`findTunnel ${name}`);

      return Promise.resolve(orphan);
    },
    hasTunnel(id) {
      calls.push(`hasTunnel ${id}`);

      return Promise.resolve(!gone.includes(id));
    },
    updateRecord(zoneId, id, content) {
      calls.push(`updateRecord ${zoneId} ${id}`);

      for (const [fqdn, record] of records) {
        if (record.id === id) {
          records.set(fqdn, { ...record, content });
        }
      }

      return Promise.resolve();
    },
    zoneOf(domain) {
      const wanted = domain.toLowerCase();

      return Promise.resolve(
        zones.find(
          (zone) => wanted === zone.name || wanted.endsWith(`.${zone.name}`)
        ) ?? null
      );
    },
    zones: () => Promise.resolve(zones),
  };

  return {
    api,
    calls,
    deps: {
      api: () => (connected ? api : null),
      connection: () => (connected ? CONNECTION : null),
      exposureOf: () => Promise.resolve(exposure),
    },
    records,
  };
}

const ROUTES: readonly TunnelRoute[] = [
  {
    hostname: "app.flymate.dev",
    project: "web",
    service: "http://127.0.0.1:3000",
  },
];

describe("les valeurs que l'app calcule", () => {
  it("ne dit rien quand le module n'est pas de la partie", async () => {
    const { deps } = harness();

    const values = await managedValues("srv-1", ["core.system"], deps);

    expect(values).toEqual({ ok: true, result: { config: {}, secrets: {} } });
  });

  it("refuse, et dit pourquoi, sans compte connecté", async () => {
    const { deps } = harness({ connected: false });

    const values = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(values.ok).toBe(false);
  });

  it("fait le tunnel du serveur qui n'en a pas, et livre son secret une fois", async () => {
    const { deps, calls } = harness();

    const values = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(values).toEqual({
      ok: true,
      result: {
        config: {
          [CLOUDFLARE_EXPOSURE]: {
            account_tag: "acc-1234",
            tunnel_id: "t-1",
          },
        },
        secrets: {
          [CLOUDFLARE_EXPOSURE]: { tunnel_secret: expect.any(String) },
        },
      },
    });

    expect(calls).toContain("createTunnel pupitre-srv-1");
  });

  /**
   * The domain is the client's own answer, in the module's form: nothing here
   * knows it, and nothing here sends it.
   */
  it("ne décide pas du domaine", async () => {
    const { deps } = harness();

    const values = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(
      values.ok ? values.result.config[CLOUDFLARE_EXPOSURE] : {}
    ).not.toHaveProperty("domain");
  });

  /**
   * The server is the only place a tunnel identifier lives. A laptop that was
   * reinstalled, or a colleague opening the same machine, reads it back rather
   * than making a second tunnel and repointing every record onto it.
   */
  it("garde le tunnel que le serveur dit déjà faire tourner", async () => {
    const { deps, calls } = harness({
      exposure: { domain: "flymate.dev", tunnelId: "t-kept" },
    });

    const values = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(values).toEqual({
      ok: true,
      result: {
        config: {
          [CLOUDFLARE_EXPOSURE]: {
            account_tag: "acc-1234",
            tunnel_id: "t-kept",
          },
        },
        secrets: {},
      },
    });

    expect(calls).not.toContain("createTunnel pupitre-srv-1");
  });

  /** cloudflared answers "Tunnel not found" for ever on a tunnel the account has dropped. */
  it("refait le tunnel que le serveur nomme quand Cloudflare ne l'a plus", async () => {
    const { deps, calls } = harness({
      exposure: { domain: "flymate.dev", tunnelId: "t-gone" },
      gone: ["t-gone"],
    });

    const values = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(calls).toContain("hasTunnel t-gone");
    expect(values).toMatchObject({
      ok: true,
      result: {
        config: { [CLOUDFLARE_EXPOSURE]: { tunnel_id: "t-1" } },
        secrets: {
          [CLOUDFLARE_EXPOSURE]: { tunnel_secret: expect.any(String) },
        },
      },
    });
  });

  /** A tunnel of the same name whose secret left with the old machine is unusable. */
  it("supprime un tunnel homonyme laissé derrière", async () => {
    const { deps, calls } = harness({ orphan: "t-orphan" });

    await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(calls).toContain("deleteTunnel t-orphan");
  });

  /** Cloudflare refuses a name its own listing did not return: the tunnel is looked for again, removed, and the name taken. */
  it("reprend un nom que Cloudflare refuse encore après la recherche", async () => {
    let refusals = 1;
    let looked = 0;
    const { deps, calls, api } = harness();

    api.findTunnel = (name: string) => {
      looked += 1;
      calls.push(`findTunnel ${name}`);

      return Promise.resolve(looked > 1 ? "t-late" : null);
    };
    api.createTunnel = (name: string) => {
      calls.push(`createTunnel ${name}`);

      if (refusals > 0) {
        refusals -= 1;

        return Promise.reject(
          new Error(
            "You already have a tunnel with this name. Delete the existing tunnel, or choose a different name for your new tunnel."
          )
        );
      }

      return Promise.resolve("t-fresh");
    };

    const answer = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(calls).toContain("deleteTunnel t-late");
    expect(answer).toMatchObject({
      ok: true,
      result: {
        config: { [CLOUDFLARE_EXPOSURE]: { tunnel_id: "t-fresh" } },
      },
    });
  });
});

describe("les enregistrements DNS", () => {
  it("suivent la zone du domaine que le serveur publie", async () => {
    const { deps, records } = harness({
      exposure: { domain: "flymate.dev", tunnelId: "t-1" },
    });

    const answer = await syncRecords("srv-1", ROUTES, deps);

    expect(answer).toEqual({ ok: true, result: 1 });
    expect(records.get("app.flymate.dev")?.content).toBe(
      "t-1.cfargotunnel.com"
    );
  });

  it("trouvent la zone d'un sous-domaine du domaine des projets", async () => {
    const { deps, records } = harness({
      exposure: { domain: "dev.flymate.dev", tunnelId: "t-1" },
    });

    await syncRecords(
      "srv-1",
      [{ hostname: "app.dev.flymate.dev", service: "http://127.0.0.1:3000" }],
      deps
    );

    expect(records.get("app.dev.flymate.dev")?.content).toBe(
      "t-1.cfargotunnel.com"
    );
  });

  it("repointent un enregistrement resté sur un tunnel disparu", async () => {
    const records = new Map<string, DnsRecord>([
      ["app.flymate.dev", { content: "t-old.cfargotunnel.com", id: "r-1" }],
    ]);
    const { deps, calls } = harness({
      exposure: { domain: "flymate.dev", tunnelId: "t-new" },
      records,
    });

    await syncRecords("srv-1", ROUTES, deps);

    expect(calls).toContain("updateRecord zone-1234 r-1");
    expect(records.get("app.flymate.dev")?.content).toBe(
      "t-new.cfargotunnel.com"
    );
  });

  it("ne touchent à rien quand l'enregistrement est déjà juste", async () => {
    const records = new Map<string, DnsRecord>([
      ["app.flymate.dev", { content: "t-1.cfargotunnel.com", id: "r-1" }],
    ]);
    const { deps } = harness({
      exposure: { domain: "flymate.dev", tunnelId: "t-1" },
      records,
    });

    expect(await syncRecords("srv-1", ROUTES, deps)).toEqual({
      ok: true,
      result: 0,
    });
  });

  it("refusent quand la zone du domaine n'est pas dans ce compte", async () => {
    const { deps } = harness({
      exposure: { domain: "ailleurs.example", tunnelId: "t-1" },
    });

    expect((await syncRecords("srv-1", ROUTES, deps)).ok).toBe(false);
  });

  it("partent avec le projet qui les portait", async () => {
    const records = new Map<string, DnsRecord>([
      ["app.flymate.dev", { content: "t-1.cfargotunnel.com", id: "r-1" }],
    ]);
    const { deps } = harness({
      exposure: { domain: "flymate.dev", tunnelId: "t-1" },
      records,
    });

    await dropRecord("srv-1", "app", deps);

    expect(records.size).toBe(0);
  });
});

describe("le tunnel d'un serveur qu'on relâche", () => {
  it("est supprimé d'après ce que le serveur en dit", async () => {
    const { deps, calls } = harness({
      exposure: { domain: "flymate.dev", tunnelId: "t-1" },
    });

    await dropTunnel("srv-1", deps);

    expect(calls).toContain("deleteTunnel t-1");
  });

  /** A machine already gone answers nothing; its name is the app's own and finds the tunnel again. */
  it("est retrouvé par son nom quand le serveur ne répond plus", async () => {
    const { deps, calls } = harness({ orphan: "t-orphan" });

    await dropTunnel("srv-1", deps);

    expect(calls).toContain("deleteTunnel t-orphan");
  });

  it("ne fait rien sans compte connecté", async () => {
    const { deps, calls } = harness({ connected: false });

    await dropTunnel("srv-1", deps);

    expect(calls).toEqual([]);
  });
});
