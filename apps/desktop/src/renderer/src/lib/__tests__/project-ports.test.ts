import { describe, expect, it } from "bun:test";
import type { Process, Project } from "@pupitre/shared/agent-protocol/state";
import {
  addedRow,
  firstRow,
  followName,
  heldBy,
  heldSubdomains,
  hostnamesOf,
  labelFrom,
  type PortRow,
  proposedWeb,
  routePatches,
  routeRequests,
  rowProblem,
  rowsFromDetection,
  rowsFromProcess,
  rowsReady,
  validHostname,
  validLabel,
} from "../project-ports";

const TURBO: Process = {
  cmd: "bunx turbo run dev",
  dir: ".",
  host: "127.0.0.1",
  id: "shop",
  path: "/home/dev/projects/shop",
  pkgmgr: "bun",
  port: 3100,
  routes: [
    { hostname: "shop.example.org", label: "web", port: 3100 },
    { hostname: "api-shop.example.org", label: "api", port: 3101 },
    { label: "docs", port: 3102 },
  ],
  state: "online",
};

const SHOP: Project = {
  boot: false,
  dir: "shop",
  name: "shop",
  path: "/home/dev/projects/shop",
  processes: [TURBO],
  state: "online",
};

const OTHER: Project = {
  boot: false,
  dir: "other",
  name: "other",
  path: "/home/dev/projects/other",
  processes: [
    {
      cmd: "bun run dev --port 4000",
      dir: ".",
      host: "127.0.0.1",
      id: "other",
      path: "/home/dev/projects/other",
      pkgmgr: "bun",
      port: 4000,
      routes: [{ hostname: "other.example.org", label: "web", port: 4000 }],
      state: "stopped",
    },
    {
      cmd: "bun run worker",
      dir: "worker",
      host: "127.0.0.1",
      id: "worker",
      path: "/home/dev/projects/other/worker",
      pkgmgr: "bun",
      port: 4010,
      routes: [],
      state: "stopped",
    },
  ],
  state: "stopped",
};

function row(partial: Partial<PortRow> & { port: number }): PortRow {
  return {
    key: `test-${partial.port}`,
    label: "web",
    ownWeb: false,
    publish: true,
    web: "",
    whole: false,
    ...partial,
  };
}

describe("labels and hostnames", () => {
  it("keep a label to one DNS label, and a hostname to at least two levels", () => {
    expect(validLabel("web")).toBe(true);
    expect(validLabel("api-v2")).toBe(true);
    expect(validLabel("Web")).toBe(false);
    expect(validLabel("web.api")).toBe(false);
    expect(validLabel("")).toBe(false);

    expect(validHostname("shop.example.org")).toBe(true);
    expect(validHostname("example")).toBe(false);
    expect(validHostname("-shop.example.org")).toBe(false);
  });

  it("fold a workspace name into a label", () => {
    expect(labelFrom("@atlas/Web App")).toBe("atlas-web-app");
    expect(labelFrom("--docs--")).toBe("docs");
  });
});

describe("the suggested web name", () => {
  it("is the project name on the first line, prefixed with the label after that", () => {
    expect(proposedWeb("my.site", "web", true, [])).toBe("my-site");
    expect(proposedWeb("my.site", "api", false, [])).toBe("api-my-site");
    expect(proposedWeb("", "api", false, [])).toBe("");
  });

  it("avoids what other projects already hold", () => {
    expect(proposedWeb("shop", "web", true, ["shop"])).toBe("shop-2");
    expect(
      heldSubdomains(["shop.example.org", "api-shop.example.org"])
    ).toEqual(["shop", "api-shop"]);
  });

  it("follows the project name on every line the reader has not edited", () => {
    const rows = followName(
      [
        row({ port: 3000 }),
        row({ label: "api", port: 3001 }),
        row({ label: "docs", ownWeb: true, port: 3002, web: "mine" }),
      ],
      "shop",
      true,
      []
    );

    expect(rows.map((current) => current.web)).toEqual([
      "shop",
      "api-shop",
      "mine",
    ]);
    expect(
      followName(rows, "shop", false, []).map((current) => current.web)
    ).toEqual(["", "", "mine"]);
  });
});

describe("port lines", () => {
  it("start on a main line, and are added on a free port and label", () => {
    const first = firstRow(3000, true);
    const held = { hostnames: [], ports: [3001, 3002] };
    const added = addedRow([first], held, true);

    expect(first).toMatchObject({ label: "web", port: 3000, publish: true });
    expect(added).toMatchObject({ label: "api", port: 3003, publish: true });
    expect(addedRow([first, added], held, false)).toMatchObject({
      label: "docs",
      port: 3004,
      publish: false,
    });
  });

  it("are read from what the agent detected, and from a declared project", () => {
    expect(
      rowsFromDetection(
        [
          { label: "web", port: 3100 },
          { label: "api", port: 3101 },
        ],
        true
      ).map((current) => [current.label, current.port, current.publish])
    ).toEqual([
      ["web", 3100, true],
      ["api", 3101, true],
    ]);

    const rows = rowsFromProcess(TURBO);

    expect(
      rows.map((current) => [
        current.label,
        current.port,
        current.publish,
        current.web,
        current.whole,
      ])
    ).toEqual([
      ["web", 3100, true, "shop.example.org", true],
      ["api", 3101, true, "api-shop.example.org", true],
      ["docs", 3102, false, "", false],
    ]);
  });

  it("keep the main port first when no route carries it", () => {
    const rows = rowsFromProcess({
      ...TURBO,
      routes: [{ label: "api", port: 3101 }],
    });

    expect(rows.map((current) => current.port)).toEqual([3100, 3101]);
  });
});

describe("what a line refuses before the agent does", () => {
  const held = heldBy([SHOP, OTHER], "shop");

  it("reads what other projects hold, excluding the project itself", () => {
    expect(held).toEqual({
      hostnames: ["other.example.org"],
      ports: [4000, 4000, 4010],
    });
    expect(hostnamesOf(SHOP)).toEqual([
      "shop.example.org",
      "api-shop.example.org",
    ]);
  });

  it("names the label, port or name at fault", () => {
    const rows = [
      row({ port: 3000, web: "shop" }),
      row({ label: "web", port: 4000, web: "api-shop" }),
      row({ label: "docs", port: 3000, web: "other" }),
      row({ label: "Docs", port: 3003, web: "x" }),
      row({ label: "admin", port: 3004, web: "-bad" }),
      row({ label: "worker", port: 80, web: "worker" }),
    ];

    expect(rowProblem(rows.slice(0, 1), 0, held, true)).toBeNull();
    expect(rowProblem(rows, 1, held, true)).toBe("labelTaken");
    expect(rowProblem(rows, 2, held, true)).toBe("portTaken");
    expect(rowProblem(rows, 3, held, true)).toBe("label");
    expect(rowProblem(rows, 4, held, true)).toBe("web");
    expect(rowProblem(rows, 5, held, true)).toBe("port");
    expect(rowProblem([row({ port: 4000 })], 0, held, false)).toBe("portTaken");
    expect(
      rowProblem(
        [row({ label: "docs", port: 3005, web: "other" })],
        0,
        held,
        true
      )
    ).toBe("webTaken");
  });

  it("judges a name only when it is published, and a full name against full names", () => {
    expect(
      rowProblem(
        [row({ port: 3000, publish: false, web: "-bad" })],
        0,
        held,
        true
      )
    ).toBeNull();
    expect(
      rowProblem([row({ port: 3000, web: "-bad" })], 0, held, false)
    ).toBeNull();
    expect(
      rowProblem(
        [row({ port: 3000, web: "other.example.org", whole: true })],
        0,
        held,
        true
      )
    ).toBe("webTaken");
    expect(
      rowProblem(
        [row({ port: 3000, web: "other", whole: true })],
        0,
        held,
        true
      )
    ).toBe("web");
    expect(
      rowsReady(
        [
          row({ port: 3000, web: "shop" }),
          row({ label: "api", port: 3001, web: "api-shop" }),
        ],
        held,
        true
      )
    ).toBe(true);
    expect(rowsReady([], held, true)).toBe(false);
  });
});

describe("what is sent to the agent", () => {
  const rows = [
    row({ port: 3000, web: "shop" }),
    row({ label: "api", port: 3001, publish: false, web: "api-shop" }),
    row({
      label: "admin",
      port: 3002,
      web: "admin.shop.example.org",
      whole: true,
    }),
  ];

  it("names a subdomain only for what is published", () => {
    expect(routeRequests(rows, true)).toEqual([
      { label: "web", port: 3000, subdomain: "shop" },
      { label: "api", port: 3001 },
      { label: "admin", port: 3002, subdomain: "admin.shop.example.org" },
    ]);
    expect(routeRequests(rows, false)).toEqual([
      { label: "web", port: 3000 },
      { label: "api", port: 3001 },
      { label: "admin", port: 3002 },
    ]);
  });

  it("returns in full a name a server kept, and as a subdomain a new name", () => {
    expect(routePatches(rows, true)).toEqual([
      { label: "web", port: 3000, subdomain: "shop" },
      { label: "api", port: 3001 },
      { hostname: "admin.shop.example.org", label: "admin", port: 3002 },
    ]);
  });
});
