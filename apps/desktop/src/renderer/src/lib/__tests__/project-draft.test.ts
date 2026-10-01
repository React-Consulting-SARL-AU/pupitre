import { describe, expect, it } from "bun:test";
import {
  folderFromSource,
  freePort,
  freeSubdomain,
  isGitSource,
  nameFromSource,
  portFromRemedy,
  spansSeveralLevels,
  startCommand,
  subdomainFromName,
  validSubdomain,
} from "../project-draft";

describe("a project's source", () => {
  it("tells a repository address from a folder path", () => {
    expect(isGitSource("https://github.com/vitejs/vite.git")).toBe(true);
    expect(isGitSource("git@github.com:moi/mon-site.git")).toBe(true);
    expect(isGitSource("apps/web")).toBe(false);
  });

  it("derives the name from the last segment of the address", () => {
    expect(nameFromSource("https://github.com/vitejs/vite-starter.git")).toBe(
      "vite-starter"
    );
    expect(nameFromSource("git@github.com:moi/Mon_Site.git")).toBe("mon_site");
    expect(nameFromSource("https://example.org/me/my-site/")).toBe("my-site");
  });

  it("derives the name from the last segment of a folder", () => {
    expect(nameFromSource("apps/web")).toBe("web");
  });

  it("yields a name the registry accepts", () => {
    const name = nameFromSource("https://example.org/me/--Étrange Nom--.git");

    expect(name).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
  });

  it("keeps the given path when the source is a folder", () => {
    expect(folderFromSource("apps/web", "web")).toBe("apps/web");
    expect(folderFromSource("https://example.org/me/site.git", "site")).toBe(
      "site"
    );
  });

  it("refuses an absolute or parent-escaping path and falls back to the name", () => {
    expect(folderFromSource("/etc/passwd", "site")).toBe("etc/passwd");
    expect(folderFromSource("../../etc", "site")).toBe("site");
  });
});

describe("the suggested subdomain", () => {
  it("folds a name's dot and underscore into a hyphen", () => {
    expect(subdomainFromName("my.site")).toBe("my-site");
    expect(subdomainFromName("my_site")).toBe("my-site");
    expect(subdomainFromName("pupitre.studio")).toBe("pupitre-studio");
  });

  it("yields no double hyphen and no hyphen at the ends", () => {
    expect(subdomainFromName("--mon..site__")).toBe("mon-site");
    expect(subdomainFromName("...")).toBe("");
  });

  it("yields a subdomain the agent accepts from a name it accepts", () => {
    for (const name of ["my.site", "my_site", "a.b.c", "x--y"]) {
      expect(validSubdomain(subdomainFromName(name))).toBe(true);
    }
  });

  it("adds a suffix while the name is taken", () => {
    expect(freeSubdomain("my.site", [])).toBe("my-site");
    expect(freeSubdomain("my.site", ["my-site"])).toBe("my-site-2");
    expect(freeSubdomain("my.site", ["my-site", "my-site-2"])).toBe(
      "my-site-3"
    );
  });

  it("suggests nothing when the name has no letter or digit", () => {
    expect(freeSubdomain("...", ["x"])).toBe("");
  });
});

describe("an entered subdomain", () => {
  it("accepts one label and several separated by dots", () => {
    expect(validSubdomain("shop")).toBe(true);
    expect(validSubdomain("api.shop")).toBe(true);
  });

  it("refuses what DNS could not carry", () => {
    for (const value of ["", "-shop", "shop-", ".shop", "shop.", "a..b", "A"]) {
      expect(validSubdomain(value)).toBe(false);
    }
  });

  it("flags several levels without refusing them", () => {
    expect(spansSeveralLevels("api.shop")).toBe(true);
    expect(spansSeveralLevels("shop")).toBe(false);
  });
});

describe("the suggested port", () => {
  it("takes the first port no declared project holds", () => {
    expect(freePort([3000, 3001])).toBe(3002);
    expect(freePort([])).toBe(3000);
  });

  it("takes the free port from the remedy field, never from a sentence", () => {
    expect(portFromRemedy({ code: "port_taken", port_free: 3001 })).toBe(3001);
  });

  it("finds no port when the error carries no remedy", () => {
    expect(portFromRemedy(undefined)).toBeNull();
  });
});

describe("the suggested start command", () => {
  it("follows the package manager and the port", () => {
    expect(startCommand("bun", 3000)).toBe("bun run dev --port 3000");
    expect(startCommand("npm", 3100)).toBe("npm run dev -- --port 3100");
  });

  it("suggests nothing when the manager installs nothing", () => {
    expect(startCommand("none", 3000)).toBe("");
    expect(startCommand("service", 3000)).toBe("");
  });
});
