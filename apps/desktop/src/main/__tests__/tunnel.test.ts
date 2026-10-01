import { describe, expect, it } from "bun:test";
import type { TunnelRoute } from "@pupitre/shared/agent-protocol/secrets";
import type { CloudflareConnection, CloudflareZone } from "@shared/cloudflare";
import type { CloudflareApi, DnsRecord } from "../cloudflare-api";
import {
  CLOUDFLARE_EXPOSURE,
  checkedRoutes,
  dropRecord,
  dropTunnel,
  ExposureUnreadable,
  managedValues,
  releaseRecords,
  type ServerExposure,
  syncRecords,
  type TunnelDeps,
} from "../tunnel-run";

const CONNECTION: CloudflareConnection = {
  accountId: "acc-1234",
  accountName: "Flyleaf",
};

const ZONE: CloudflareZone = { id: "zone-1234", name: "flyleaf.dev" };

interface Harness {
  api: CloudflareApi;
  deps: TunnelDeps;
  calls: string[];
  records: Map<string, DnsRecord>;
}

function harness({
  connected = true,
  exposure = null,
  unreadable = false,
  orphan = null,
  gone = [],
  zones = [ZONE],
  records = new Map<string, DnsRecord>(),
}: {
  connected?: boolean;
  exposure?: ServerExposure | null;
  /** The server could not be asked at all: not the same as answering nothing. */
  unreadable?: boolean;
  orphan?: string | null;
  gone?: string[];
  zones?: CloudflareZone[];
  records?: Map<string, DnsRecord>;
} = {}): Harness {
  const calls: string[] = [];
  let created = 0;

  const api: CloudflareApi = {
    createRecord(zoneId, fqdn, content) {
      calls.push(`createRecord ${zoneId} ${fqdn}`);
      records.set(fqdn, {
        comment: "pupitre",
        content,
        id: `r-${String(records.size + 1)}`,
      });

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
      exposureOf: () =>
        unreadable
          ? Promise.reject(new ExposureUnreadable("le canal est fermé"))
          : Promise.resolve(exposure),
    },
    records,
  };
}

const ROUTES: readonly TunnelRoute[] = [
  {
    hostname: "app.flyleaf.dev",
    project: "web",
    service: "http://127.0.0.1:3000",
  },
];

describe("the values the app computes", () => {
  it("says nothing when the module is not part of the install", async () => {
    const { deps } = harness();

    const values = await managedValues("srv-1", ["core.system"], deps);

    expect(values).toEqual({ ok: true, result: { config: {}, secrets: {} } });
  });

  it("refuses, and says why, without a connected account", async () => {
    const { deps } = harness({ connected: false });

    const values = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(values.ok).toBe(false);
  });

  // Read as "no tunnel", an unreachable server once had its live tunnel deleted by name and remade.
  it("touches nothing when the server could not be queried", async () => {
    const { deps, calls } = harness({ unreadable: true });

    const values = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(values.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("creates the tunnel for a server that has none, and delivers its secret once", async () => {
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

  it("does not decide the domain", async () => {
    const { deps } = harness();

    const values = await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(
      values.ok ? values.result.config[CLOUDFLARE_EXPOSURE] : {}
    ).not.toHaveProperty("domain");
  });

  it("keeps the tunnel the server says is already running", async () => {
    const { deps, calls } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-kept" },
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

  it("recreates the tunnel the server names when Cloudflare no longer has it", async () => {
    const { deps, calls } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-gone" },
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

  it("deletes a same-name tunnel left behind", async () => {
    const { deps, calls } = harness({ orphan: "t-orphan" });

    await managedValues("srv-1", [CLOUDFLARE_EXPOSURE], deps);

    expect(calls).toContain("deleteTunnel t-orphan");
  });

  // Cloudflare can refuse a name its own listing did not return yet.
  it("retries a name Cloudflare still refuses after the lookup", async () => {
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

describe("the routes the renderer names", () => {
  it("pass when each has the shape of the contract", () => {
    expect(checkedRoutes([])).toEqual([]);
    expect(checkedRoutes(ROUTES)).toEqual([...ROUTES]);
  });

  it("are all refused as soon as one does not have the shape", () => {
    expect(checkedRoutes(null)).toBeNull();
    expect(checkedRoutes("app.flyleaf.dev")).toBeNull();
    expect(checkedRoutes([{ hostname: "app.flyleaf.dev" }])).toBeNull();
    expect(checkedRoutes([{ hostname: 42, service: "http://x" }])).toBeNull();
  });
});

describe("the DNS records", () => {
  it("stay under the domain the server publishes", async () => {
    const { deps, records, calls } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-1" },
    });

    const answer = await syncRecords(
      "srv-1",
      [
        ...ROUTES,
        { hostname: "app.flyleaf.dev.evil.test", service: "http://x" },
      ],
      deps
    );

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "bad_request",
        phrase: {
          id: "refusal.tunnel.route.foreign",
          values: {
            domain: "flyleaf.dev",
            hostname: "app.flyleaf.dev.evil.test",
          },
        },
      },
    });
    expect(records.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("follow the zone of the domain the server publishes", async () => {
    const { deps, records } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-1" },
    });

    const answer = await syncRecords("srv-1", ROUTES, deps);

    expect(answer).toEqual({ ok: true, result: 1 });
    expect(records.get("app.flyleaf.dev")?.content).toBe(
      "t-1.cfargotunnel.com"
    );
  });

  it("find the zone of a subdomain of the projects domain", async () => {
    const { deps, records } = harness({
      exposure: { domain: "dev.flyleaf.dev", tunnelId: "t-1" },
    });

    await syncRecords(
      "srv-1",
      [{ hostname: "app.dev.flyleaf.dev", service: "http://127.0.0.1:3000" }],
      deps
    );

    expect(records.get("app.dev.flyleaf.dev")?.content).toBe(
      "t-1.cfargotunnel.com"
    );
  });

  it("repoint a record left on a vanished tunnel", async () => {
    const records = new Map<string, DnsRecord>([
      [
        "app.flyleaf.dev",
        { comment: "pupitre", content: "t-old.cfargotunnel.com", id: "r-1" },
      ],
    ]);
    const { deps, calls } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-new" },
      records,
    });

    await syncRecords("srv-1", ROUTES, deps);

    expect(calls).toContain("updateRecord zone-1234 r-1");
    expect(records.get("app.flyleaf.dev")?.content).toBe(
      "t-new.cfargotunnel.com"
    );
  });

  it("touch nothing when the record is already correct", async () => {
    const records = new Map<string, DnsRecord>([
      [
        "app.flyleaf.dev",
        { comment: "pupitre", content: "t-1.cfargotunnel.com", id: "r-1" },
      ],
    ]);
    const { deps } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-1" },
      records,
    });

    expect(await syncRecords("srv-1", ROUTES, deps)).toEqual({
      ok: true,
      result: 0,
    });
  });

  it("refuse a name already held by a record Pupitre did not write", async () => {
    const records = new Map<string, DnsRecord>([
      [
        "app.flyleaf.dev",
        { comment: null, content: "203.0.113.10", id: "r-1" },
      ],
    ]);
    const { deps, calls } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-1" },
      records,
    });

    const refused = await syncRecords("srv-1", ROUTES, deps);

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.phrase?.id).toBe(
      "refusal.cloudflare.record.taken"
    );
    expect(calls).not.toContain("updateRecord zone-1234 r-1");
    expect(records.get("app.flyleaf.dev")?.content).toBe("203.0.113.10");
  });

  it("refuse when the domain's zone is not in this account", async () => {
    const { deps } = harness({
      exposure: { domain: "ailleurs.example", tunnelId: "t-1" },
    });

    expect((await syncRecords("srv-1", ROUTES, deps)).ok).toBe(false);
  });

  it("go away with the name the project no longer carries", async () => {
    const records = new Map<string, DnsRecord>([
      [
        "app.flyleaf.dev",
        { comment: "pupitre", content: "t-1.cfargotunnel.com", id: "r-1" },
      ],
      [
        "api-app.flyleaf.dev",
        { comment: "pupitre", content: "t-1.cfargotunnel.com", id: "r-2" },
      ],
    ]);
    const { deps } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-1" },
      records,
    });

    await dropRecord("srv-1", "api-app.flyleaf.dev", deps);

    expect([...records.keys()]).toEqual(["app.flyleaf.dev"]);
  });

  it("leave in place a name Pupitre did not write", async () => {
    const records = new Map<string, DnsRecord>([
      [
        "app.flyleaf.dev",
        { comment: null, content: "203.0.113.10", id: "r-1" },
      ],
    ]);
    const { deps, calls } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-1" },
      records,
    });

    await dropRecord("srv-1", "app.flyleaf.dev", deps);

    expect(calls).not.toContain("deleteRecord zone-1234 r-1");
    expect([...records.keys()]).toEqual(["app.flyleaf.dev"]);
  });

  it("remove the names from before a domain change, Pupitre's own only", async () => {
    const records = new Map<string, DnsRecord>([
      [
        "app.flyleaf.dev",
        { comment: "pupitre", content: "t-1.cfargotunnel.com", id: "r-1" },
      ],
      [
        "api-app.flyleaf.dev",
        { comment: "pupitre", content: "t-1.cfargotunnel.com", id: "r-2" },
      ],
      [
        "dev.flyleaf.dev",
        { comment: null, content: "t-9.cfargotunnel.com", id: "r-3" },
      ],
    ]);
    const { deps, calls } = harness({
      exposure: { domain: "flyleaf.studio", tunnelId: "t-1" },
      records,
    });

    const released = await releaseRecords(
      "srv-1",
      [
        "app.flyleaf.dev",
        "api-app.flyleaf.dev",
        "dev.flyleaf.dev",
        "x.ailleurs.example",
      ],
      deps
    );

    expect(released).toEqual({ ok: true, result: 2 });
    expect([...records.keys()]).toEqual(["dev.flyleaf.dev"]);
    expect(calls).not.toContain("deleteRecord zone-1234 r-3");
  });

  it("look up nothing outside the domain the server publishes", async () => {
    const records = new Map<string, DnsRecord>([
      [
        "app.flyleaf.dev",
        { comment: "pupitre", content: "t-1.cfargotunnel.com", id: "r-1" },
      ],
    ]);
    const { deps, calls } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-1" },
      records,
    });

    await dropRecord("srv-1", "app.elsewhere.org", deps);

    expect(records.size).toBe(1);
    expect(calls).toEqual([]);
  });
});

describe("the tunnel of a server being released", () => {
  it("is deleted according to what the server says about it", async () => {
    const { deps, calls } = harness({
      exposure: { domain: "flyleaf.dev", tunnelId: "t-1" },
    });

    await dropTunnel("srv-1", deps);

    expect(calls).toContain("deleteTunnel t-1");
  });

  it("is found by its name when the server no longer answers", async () => {
    const { deps, calls } = harness({ orphan: "t-orphan" });

    await dropTunnel("srv-1", deps);

    expect(calls).toContain("deleteTunnel t-orphan");
  });

  it("is found by its name when the server can no longer be queried", async () => {
    const { deps, calls } = harness({ orphan: "t-orphan", unreadable: true });

    await dropTunnel("srv-1", deps);

    expect(calls).toContain("deleteTunnel t-orphan");
  });

  it("does nothing without a connected account", async () => {
    const { deps, calls } = harness({ connected: false });

    await dropTunnel("srv-1", deps);

    expect(calls).toEqual([]);
  });
});
