import { describe, expect, it } from "bun:test";
import { OTHER_PAGE, OWN_PAGE, recordChannels, refused } from "./ipc-recorder";

recordChannels();

const { registerProjects } = await import("../projects");
const { registerServices } = await import("../services");
const { registerCatalog } = await import("../catalog");
const { registerInstall } = await import("../install");

registerProjects({ root: () => Promise.resolve(null) });
registerServices();
registerCatalog();
registerInstall();

describe("the project channels", () => {
  it("refuse a frame other than the app's page", () => {
    expect(refused("project:list", OTHER_PAGE, "srv")).toBe(true);
    expect(refused("project:logs-cancel", OTHER_PAGE, "token")).toBe(true);
  });

  it("refuse one argument too many", () => {
    expect(refused("project:list", OWN_PAGE, "srv", "extra")).toBe(true);
    expect(refused("github:repos", OWN_PAGE, true, "extra")).toBe(true);
    expect(refused("project:add", OWN_PAGE, "srv", {}, "extra")).toBe(true);
    expect(refused("project:update", OWN_PAGE, "srv", {}, "extra")).toBe(true);
    expect(
      refused("project:on", OWN_PAGE, "project.pull", "srv", "app", "extra")
    ).toBe(true);
    expect(
      refused("project:act", OWN_PAGE, "project.up", "srv", "app", null, "x")
    ).toBe(true);
    expect(
      refused("project:checkout", OWN_PAGE, "srv", "app", "main", "extra")
    ).toBe(true);
    expect(
      refused("project:env", OWN_PAGE, "srv", "app", false, null, "extra")
    ).toBe(true);
    expect(
      refused("project:diff", OWN_PAGE, "srv", "app", "a.ts", "extra")
    ).toBe(true);
    expect(
      refused("project:editor", OWN_PAGE, "srv", "vscode", "/a", "extra")
    ).toBe(true);
    expect(
      refused(
        "project:logs",
        OWN_PAGE,
        "token",
        "srv",
        "app",
        "web",
        100,
        true,
        "extra"
      )
    ).toBe(true);
    expect(refused("project:logs-cancel", OWN_PAGE, "token", "extra")).toBe(
      true
    );
  });

  it("refuse a refresh that is not a boolean", () => {
    expect(refused("github:repos", OWN_PAGE, "yes")).toBe(true);
  });

  it("refuse an environment forced by anything other than a boolean", () => {
    expect(refused("project:env", OWN_PAGE, "srv", "app", "yes", null)).toBe(
      true
    );
  });

  it("refuse an editor opened without a named server or editor", () => {
    expect(refused("project:editor", OWN_PAGE, 3, "vscode", "/a")).toBe(true);
    expect(refused("project:editor", OWN_PAGE, "srv", null, "/a")).toBe(true);
  });

  it("refuse a log without a token or followed by anything other than a boolean", () => {
    expect(
      refused("project:logs", OWN_PAGE, 3, "srv", "app", "web", 100, true)
    ).toBe(true);
    expect(
      refused("project:logs", OWN_PAGE, "token", "srv", "app", "web", 100, 1)
    ).toBe(true);
    expect(refused("project:logs-cancel", OWN_PAGE, 3)).toBe(true);
  });

  it("let a log be stopped by its token", () => {
    expect(refused("project:logs-cancel", OWN_PAGE, "token")).toBe(false);
  });
});

describe("the service channels", () => {
  it("refuse a frame other than the app's page", () => {
    expect(refused("service:forwards", OTHER_PAGE, null)).toBe(true);
    expect(refused("service:logs-cancel", OTHER_PAGE, "token")).toBe(true);
  });

  it("refuse one argument too many", () => {
    expect(refused("service:detail", OWN_PAGE, "srv", "pg", "extra")).toBe(
      true
    );
    expect(
      refused("service:db-url", OWN_PAGE, "srv", "pg", null, "extra")
    ).toBe(true);
    expect(
      refused("service:forward-open", OWN_PAGE, "srv", 5432, "pg", "extra")
    ).toBe(true);
    expect(
      refused("service:db-shell", OWN_PAGE, "srv", "pg", null, "extra")
    ).toBe(true);
    expect(refused("service:forget", OWN_PAGE, "srv", null, "extra")).toBe(
      true
    );
    expect(
      refused(
        "service:logs",
        OWN_PAGE,
        "token",
        "srv",
        "pg",
        100,
        true,
        "extra"
      )
    ).toBe(true);
  });

  it("refuse an identifier that is not a string", () => {
    expect(
      refused("service:credential-reveal", OWN_PAGE, 3, "pg", "password")
    ).toBe(true);
    expect(
      refused("service:credential-reveal", OWN_PAGE, "srv", "pg", null)
    ).toBe(true);
    expect(
      refused("service:credential-copy", OWN_PAGE, "srv", 3, "password")
    ).toBe(true);
    expect(refused("service:forget", OWN_PAGE, 3, null)).toBe(true);
    expect(refused("service:forget", OWN_PAGE, "srv", 3)).toBe(true);
    expect(refused("service:forward-close", OWN_PAGE, 3)).toBe(true);
    expect(refused("service:forwards", OWN_PAGE, 3)).toBe(true);
  });

  it("refuse a log without a token or followed by anything other than a boolean", () => {
    expect(refused("service:logs", OWN_PAGE, 3, "srv", "pg", 100, true)).toBe(
      true
    );
    expect(
      refused("service:logs", OWN_PAGE, "token", "srv", "pg", 100, "yes")
    ).toBe(true);
    expect(refused("service:logs-cancel", OWN_PAGE, 3)).toBe(true);
  });

  it("let the list of redirects and the stopping of a log through", () => {
    expect(refused("service:forwards", OWN_PAGE, null)).toBe(false);
    expect(refused("service:logs-cancel", OWN_PAGE, "token")).toBe(false);
  });
});

describe("the catalogue channels", () => {
  it("refuse a frame other than the app's page", () => {
    expect(refused("catalog:secret-forget", OTHER_PAGE, "srv")).toBe(true);
  });

  it("refuse one argument too many", () => {
    expect(refused("catalog:list", OWN_PAGE, "srv", "extra")).toBe(true);
    expect(
      refused("catalog:secret-set", OWN_PAGE, "srv", "pg", "k", "v", "extra")
    ).toBe(true);
    expect(
      refused("catalog:secret-generate", OWN_PAGE, "srv", "pg", "k", "extra")
    ).toBe(true);
    expect(refused("catalog:secret-forget", OWN_PAGE, "srv", "extra")).toBe(
      true
    );
  });

  it("refuse a module, key or secret that is not a string", () => {
    expect(refused("catalog:secret-set", OWN_PAGE, "srv", 3, "k", "v")).toBe(
      true
    );
    expect(refused("catalog:secret-set", OWN_PAGE, "srv", "pg", "k", 3)).toBe(
      true
    );
    expect(
      refused("catalog:secret-generate", OWN_PAGE, "srv", "pg", null)
    ).toBe(true);
    expect(refused("catalog:secret-reveal", OWN_PAGE, 3, "pg", "k")).toBe(true);
    expect(refused("catalog:secret-forget", OWN_PAGE, 3)).toBe(true);
  });
});

describe("the installation channels", () => {
  it("refuse a frame other than the app's page", () => {
    expect(refused("install:report", OTHER_PAGE, "srv")).toBe(true);
  });

  it("refuse one argument too many", () => {
    expect(
      refused("install:start", OWN_PAGE, "token", "srv", ["pg"], {}, [], "x")
    ).toBe(true);
    expect(
      refused("install:check", OWN_PAGE, "srv", ["pg"], {}, [], "extra")
    ).toBe(true);
    expect(
      refused("install:agent-send", OWN_PAGE, "token", "srv", "extra")
    ).toBe(true);
    expect(refused("install:report", OWN_PAGE, "srv", "extra")).toBe(true);
  });

  it("refuse a stream without a token", () => {
    expect(refused("install:start", OWN_PAGE, 3, "srv", ["pg"], {}, [])).toBe(
      true
    );
    expect(refused("install:agent-send", OWN_PAGE, null, "srv")).toBe(true);
  });

  it("refuse a configuration that is not an object", () => {
    expect(
      refused("install:start", OWN_PAGE, "token", "srv", ["pg"], "x", [])
    ).toBe(true);
    expect(refused("install:check", OWN_PAGE, "srv", ["pg"], null, [])).toBe(
      true
    );
  });

  it("refuse deferred modules that are not names", () => {
    expect(
      refused("install:start", OWN_PAGE, "token", "srv", ["pg"], {}, [3])
    ).toBe(true);
    expect(refused("install:check", OWN_PAGE, "srv", ["pg"], {}, "pg")).toBe(
      true
    );
  });
});
