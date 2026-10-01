import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACCOUNT_MIGRATIONS } from "../account-migrations";
import { CONNECTIONS_MIGRATIONS } from "../connections-migrations";
import { SERVERS_MIGRATIONS } from "../servers-migrations";
import {
  expectedRevision,
  forgetCopies,
  type JsonObject,
  keepCopy,
  migrate,
  type StoreMigration,
  versionedFile,
} from "../store-migrations";

const RENAME: StoreMigration = {
  apply: (document) => {
    const { tz, ...rest } = document;

    return { ...rest, timezone: tz };
  },
  id: 1,
  slug: "rename-tz",
};

const ADD: StoreMigration = {
  apply: (document) => ({ ...document, theme: document.theme ?? "system" }),
  id: 2,
  slug: "theme-default",
};

function folder(): string {
  return mkdtempSync(join(tmpdir(), "pupitre-store-"));
}

describe("an app file's registry", () => {
  it("replays everything the file is owed, in order", () => {
    const migrated = migrate({ tz: "UTC" }, [ADD, RENAME]);

    expect(migrated.applied).toEqual([1, 2]);
    expect(migrated.document).toEqual({
      theme: "system",
      timezone: "UTC",
      version: 2,
    });
  });

  it("does not replay what the file already carries", () => {
    const migrated = migrate({ timezone: "UTC", version: 1 }, [ADD, RENAME]);

    expect(migrated.applied).toEqual([2]);
    expect(migrated.revision).toBe(2);
  });

  it("does not touch a file written by a newer version", () => {
    const held = { timezone: "UTC", unknown: 42, version: 9 };
    const migrated = migrate(held, [ADD, RENAME]);

    expect(migrated.applied).toEqual([]);
    expect(migrated.document).toEqual(held);
    expect(migrated.revision).toBe(9);
  });

  it("keeps what today's code no longer names", () => {
    const migrated = migrate({ legacy: "gardé", tz: "UTC" }, [RENAME]);

    expect(migrated.document.legacy).toBe("gardé");
  });

  it("states the revision this code reads", () => {
    expect(expectedRevision([ADD, RENAME])).toBe(2);
    expect(expectedRevision([])).toBe(0);
  });
});

describe("the pre-migration copy", () => {
  it("keeps the file under the revision it carried", () => {
    const dir = folder();
    const path = join(dir, "servers.json");

    writeFileSync(path, `{"version":2}`);

    const copy = keepCopy(path, 2);

    expect(copy).toBe(`${path}.r2`);
    expect(readFileSync(`${path}.r2`, "utf8")).toBe(`{"version":2}`);
  });

  it("does not overwrite a copy already taken of this revision", () => {
    const dir = folder();
    const path = join(dir, "servers.json");

    writeFileSync(path, `{"version":2}`);
    keepCopy(path, 2);

    writeFileSync(path, `{"version":2,"réparé":true}`);
    keepCopy(path, 2);

    expect(readFileSync(`${path}.r2`, "utf8")).toBe(`{"version":2}`);
  });

  it("goes away with the file it duplicates", () => {
    const dir = folder();
    const path = join(dir, "account.json");

    writeFileSync(path, "{}");
    keepCopy(path, 0);

    forgetCopies(path);

    expect(existsSync(`${path}.r0`)).toBe(false);
  });
});

describe("a versioned file", () => {
  function file(dir = folder()) {
    const path = join(dir, "store.json");

    return {
      path,
      store: versionedFile({ baseline: 1, migrations: [ADD], path }),
    };
  }

  it("migrates on read, keeps the previous shape and is written stamped", () => {
    const { path, store } = file();

    writeFileSync(path, JSON.stringify({ tz: "UTC", version: 1 }));

    const held = store.read();

    expect(held).toMatchObject({
      document: { theme: "system", tz: "UTC", version: 2 },
      migrated: true,
      revision: 2,
      status: "read",
    });
    expect(readFileSync(`${path}.r1`, "utf8")).toContain('"tz":"UTC"');
    expect(store.write({ theme: "dark", version: 0 })).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      theme: "dark",
      version: 2,
    });
  });

  it("never rewrites a file from a newer version", () => {
    const { path, store } = file();
    const newer = JSON.stringify({ later: true, version: 9 });

    writeFileSync(path, newer);

    expect(store.read()).toMatchObject({ revision: 9, status: "read" });
    expect(store.frozen()).toBe(true);
    expect(store.write({ theme: "dark" })).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(newer);
  });

  it("knows it is frozen even when written without having been read", () => {
    const { path, store } = file();
    const newer = JSON.stringify({ version: 9 });

    writeFileSync(path, newer);

    expect(store.write({ theme: "dark" })).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(newer);
  });

  it("sets an unreadable file aside before anything overwrites it", () => {
    const { path, store } = file();

    writeFileSync(path, "{ pas du json");

    expect(store.read()).toEqual({
      copy: `${path}.corrupt`,
      status: "corrupt",
    });
    expect(readFileSync(`${path}.corrupt`, "utf8")).toBe("{ pas du json");
  });

  it("writes alongside then renames, leaving no temporary file", () => {
    const dir = folder();
    const { path, store } = file(dir);

    store.write({ theme: "light" });

    expect(readdirSync(dir)).toEqual(["store.json"]);
    expect(JSON.parse(readFileSync(path, "utf8")).theme).toBe("light");
  });

  it("reports nothing when the file does not exist", () => {
    expect(file().store.read()).toEqual({ status: "absent" });
  });
});

describe("the account.json registry", () => {
  it("gives organizations to an identity written before they were read", () => {
    const held: JsonObject = {
      identity: { email: "moi@example.com", id: "u_1" },
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS);

    expect(migrated.document.identity).toMatchObject({ organizations: [] });
  });

  it("does not touch an identity that already carries them", () => {
    const held: JsonObject = {
      identity: { id: "u_1", organizations: [{ id: "org_1" }] },
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS);

    expect(migrated.document.identity).toMatchObject({
      organizations: [{ id: "org_1" }],
    });
  });

  it("does not bother with a record without an identity", () => {
    const migrated = migrate({ device: null }, ACCOUNT_MIGRATIONS);

    expect(migrated.document.identity).toBeUndefined();
    expect(migrated.revision).toBe(3);
  });

  it("gives a null subscription to an identity written before it was read", () => {
    const held: JsonObject = {
      identity: { id: "u_1", organizations: [] },
      version: 1,
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS.slice(0, 2));

    expect(migrated.applied).toEqual([2]);
    expect(migrated.document.identity).toMatchObject({ subscription: null });
  });

  it("names the right of use a licence and keeps the subscription's servers, without making them a licence", () => {
    const held: JsonObject = {
      identity: {
        entitlement: "valid",
        id: "u_1",
        legacy: 1,
        organizations: [],
        subscription: {
          current_period_end: null,
          servers: { limit: 1, used: 1 },
          status: "active",
          trial_ends_at: null,
        },
      },
      version: 2,
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS);

    expect(migrated.applied).toEqual([3]);
    expect(migrated.document.identity).toEqual({
      id: "u_1",
      legacy: 1,
      license: "valid",
      licenseGrant: null,
      organizations: [],
      servers: { limit: 1, used: 1 },
    });

    const again = migrate(migrated.document, ACCOUNT_MIGRATIONS);

    expect(again.applied).toEqual([]);
    expect(again.document).toEqual(migrated.document);
  });

  it("gives null servers to an identity without a subscription", () => {
    const held: JsonObject = {
      identity: {
        entitlement: "suspended",
        id: "u_1",
        organizations: [],
        subscription: null,
      },
      version: 2,
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS);

    expect(migrated.document.identity).toEqual({
      id: "u_1",
      license: "suspended",
      licenseGrant: null,
      organizations: [],
      servers: null,
    });
  });

  it("carries an identity of the very first shape all the way to the licence", () => {
    const migrated = migrate(
      { identity: { entitlement: "grace", id: "u_1" } },
      ACCOUNT_MIGRATIONS
    );

    expect(migrated.document.identity).toEqual({
      id: "u_1",
      license: "grace",
      licenseGrant: null,
      organizations: [],
      servers: null,
    });
  });
});

describe("the servers.json registry", () => {
  const held: JsonObject = {
    active: "srv-1",
    servers: [
      {
        host: "203.0.113.10",
        id: "srv-1",
        name: "Atelier d'Été",
        origin: "app",
      },
      {
        host: "203.0.113.11",
        id: "srv-2",
        name: "atelier-d-ete",
        origin: "app",
      },
      { host: "dev-vps", id: "srv-3", name: "Poste", origin: "system" },
      { host: "203.0.113.12", id: "srv-4", name: "dev-vps", origin: "app" },
      {
        host: "203.0.113.13",
        id: "srv-5",
        name: "···",
        origin: "app",
        stale: 1,
      },
    ],
    version: 3,
  };

  it("gives each server the SSH name it carried, derived from its name", () => {
    const migrated = migrate(held, SERVERS_MIGRATIONS);

    expect(migrated.applied).toEqual([4]);
    expect(
      (migrated.document.servers as JsonObject[]).map((server) => server.slug)
    ).toEqual(["atelier-d-ete", undefined, undefined, undefined, undefined]);
  });

  it("carries the fields today's code no longer names, and does not come back to them", () => {
    const migrated = migrate(held, SERVERS_MIGRATIONS);

    expect((migrated.document.servers as JsonObject[])[4]).toMatchObject({
      stale: 1,
    });

    const again = migrate(migrated.document, SERVERS_MIGRATIONS);

    expect(again.applied).toEqual([]);
    expect(again.document).toEqual(migrated.document);
  });

  it("leaves the SSH name a server already carries", () => {
    const migrated = migrate(
      {
        servers: [
          {
            host: "203.0.113.10",
            id: "srv-1",
            name: "Atelier",
            origin: "app",
            slug: "prod",
          },
        ],
        version: 3,
      },
      SERVERS_MIGRATIONS
    );

    expect((migrated.document.servers as JsonObject[])[0]?.slug).toBe("prod");
  });

  it("does not bother with a file without a list", () => {
    const migrated = migrate({ active: null }, SERVERS_MIGRATIONS);

    expect(migrated.document).toEqual({ active: null, version: 4 });
  });
});

describe("the connections registry", () => {
  it("names id and name the account that Cloudflare wrote as accountId and accountName", () => {
    const migrated = migrate(
      {
        connection: { accountId: "acc-1", accountName: "Atelier", legacy: 1 },
        settings: { zone: "z" },
      },
      CONNECTIONS_MIGRATIONS
    );

    expect(migrated.document).toEqual({
      connection: { id: "acc-1", legacy: 1, name: "Atelier" },
      settings: { zone: "z" },
      version: 1,
    });

    const again = migrate(
      { ...migrated.document, version: 0 },
      CONNECTIONS_MIGRATIONS
    );

    expect(again.document).toEqual(migrated.document);
  });

  it("leaves a record without an account, or one that already names it", () => {
    expect(
      migrate({ connection: null }, CONNECTIONS_MIGRATIONS).document
    ).toEqual({ connection: null, version: 1 });
    expect(
      migrate({ connection: { id: "42", name: "ada" } }, CONNECTIONS_MIGRATIONS)
        .document
    ).toEqual({ connection: { id: "42", name: "ada" }, version: 1 });
  });
});
