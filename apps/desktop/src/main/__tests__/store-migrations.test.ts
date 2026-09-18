import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACCOUNT_MIGRATIONS } from "../account-migrations";
import { SERVERS_MIGRATIONS } from "../servers-migrations";
import {
  expectedRevision,
  forgetCopies,
  type JsonObject,
  keepCopy,
  migrate,
  type StoreMigration,
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

describe("le registre d'un fichier de l'app", () => {
  it("rejoue tout ce que le fichier doit, dans l'ordre", () => {
    const migrated = migrate({ tz: "UTC" }, [ADD, RENAME]);

    expect(migrated.applied).toEqual([1, 2]);
    expect(migrated.document).toEqual({
      theme: "system",
      timezone: "UTC",
      version: 2,
    });
  });

  it("ne rejoue pas ce que le fichier porte déjà", () => {
    const migrated = migrate({ timezone: "UTC", version: 1 }, [ADD, RENAME]);

    expect(migrated.applied).toEqual([2]);
    expect(migrated.revision).toBe(2);
  });

  it("ne touche pas un fichier écrit par une version plus récente", () => {
    const held = { timezone: "UTC", unknown: 42, version: 9 };
    const migrated = migrate(held, [ADD, RENAME]);

    expect(migrated.applied).toEqual([]);
    expect(migrated.document).toEqual(held);
    expect(migrated.revision).toBe(9);
  });

  it("garde ce que le code d'aujourd'hui ne nomme plus", () => {
    const migrated = migrate({ legacy: "gardé", tz: "UTC" }, [RENAME]);

    expect(migrated.document.legacy).toBe("gardé");
  });

  it("dit la révision que ce code lit", () => {
    expect(expectedRevision([ADD, RENAME])).toBe(2);
    expect(expectedRevision([])).toBe(0);
  });
});

describe("la copie d'avant la migration", () => {
  it("garde le fichier sous la révision qu'il portait", () => {
    const dir = folder();
    const path = join(dir, "servers.json");
    writeFileSync(path, `{"version":2}`);

    const copy = keepCopy(path, 2);

    expect(copy).toBe(`${path}.r2`);
    expect(readFileSync(`${path}.r2`, "utf8")).toBe(`{"version":2}`);
  });

  it("n'écrase pas une copie déjà prise de cette révision", () => {
    const dir = folder();
    const path = join(dir, "servers.json");
    writeFileSync(path, `{"version":2}`);
    keepCopy(path, 2);

    writeFileSync(path, `{"version":2,"réparé":true}`);
    keepCopy(path, 2);

    expect(readFileSync(`${path}.r2`, "utf8")).toBe(`{"version":2}`);
  });

  it("s'en va avec le fichier qu'elle double", () => {
    const dir = folder();
    const path = join(dir, "account.json");
    writeFileSync(path, "{}");
    keepCopy(path, 0);

    forgetCopies(path);

    expect(existsSync(`${path}.r0`)).toBe(false);
  });
});

describe("le registre de account.json", () => {
  it("donne ses organisations à une identité écrite avant qu'on les lise", () => {
    const held: JsonObject = {
      identity: { email: "moi@example.com", id: "u_1" },
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS);

    expect(migrated.document.identity).toMatchObject({ organizations: [] });
  });

  it("ne touche pas une identité qui les porte déjà", () => {
    const held: JsonObject = {
      identity: { id: "u_1", organizations: [{ id: "org_1" }] },
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS);

    expect(migrated.document.identity).toMatchObject({
      organizations: [{ id: "org_1" }],
    });
  });

  it("ne se met pas en peine d'un enregistrement sans identité", () => {
    const migrated = migrate({ device: null }, ACCOUNT_MIGRATIONS);

    expect(migrated.document.identity).toBeUndefined();
    expect(migrated.revision).toBe(2);
  });

  it("donne un abonnement nul à une identité écrite avant qu'on le lise, et n'y revient pas", () => {
    const held: JsonObject = {
      identity: { id: "u_1", organizations: [] },
      version: 1,
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS);

    expect(migrated.applied).toEqual([2]);
    expect(migrated.document.identity).toMatchObject({ subscription: null });

    const again = migrate(migrated.document, ACCOUNT_MIGRATIONS);

    expect(again.applied).toEqual([]);
    expect(again.document).toEqual(migrated.document);
  });

  it("garde l'abonnement qu'une identité porte déjà", () => {
    const held: JsonObject = {
      identity: {
        id: "u_1",
        organizations: [],
        subscription: { status: "active" },
      },
    };

    const migrated = migrate(held, ACCOUNT_MIGRATIONS);

    expect(migrated.document.identity).toMatchObject({
      subscription: { status: "active" },
    });
  });
});

describe("le registre de servers.json", () => {
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

  it("donne à chaque serveur le nom SSH qu'il portait, dessiné depuis son nom", () => {
    const migrated = migrate(held, SERVERS_MIGRATIONS);

    expect(migrated.applied).toEqual([4]);
    expect(
      (migrated.document.servers as JsonObject[]).map((server) => server.slug)
    ).toEqual(["atelier-d-ete", undefined, undefined, undefined, undefined]);
  });

  it("porte les champs que le code d'aujourd'hui ne nomme plus, et n'y revient pas", () => {
    const migrated = migrate(held, SERVERS_MIGRATIONS);

    expect((migrated.document.servers as JsonObject[])[4]).toMatchObject({
      stale: 1,
    });

    const again = migrate(migrated.document, SERVERS_MIGRATIONS);

    expect(again.applied).toEqual([]);
    expect(again.document).toEqual(migrated.document);
  });

  it("laisse le nom SSH qu'un serveur porte déjà", () => {
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

  it("ne se met pas en peine d'un fichier sans liste", () => {
    const migrated = migrate({ active: null }, SERVERS_MIGRATIONS);

    expect(migrated.document).toEqual({ active: null, version: 4 });
  });
});
