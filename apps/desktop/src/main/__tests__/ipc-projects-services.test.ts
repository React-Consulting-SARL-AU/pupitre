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

describe("les canaux des projets", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("project:list", OTHER_PAGE, "srv")).toBe(true);
    expect(refused("project:logs-cancel", OTHER_PAGE, "token")).toBe(true);
  });

  it("refusent un argument de trop", () => {
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

  it("refusent un rafraîchissement qui n'est pas un booléen", () => {
    expect(refused("github:repos", OWN_PAGE, "yes")).toBe(true);
  });

  it("refusent un environnement forcé par autre chose qu'un booléen", () => {
    expect(refused("project:env", OWN_PAGE, "srv", "app", "yes", null)).toBe(
      true
    );
  });

  it("refusent un éditeur ouvert sans serveur ni éditeur nommés", () => {
    expect(refused("project:editor", OWN_PAGE, 3, "vscode", "/a")).toBe(true);
    expect(refused("project:editor", OWN_PAGE, "srv", null, "/a")).toBe(true);
  });

  it("refusent un journal sans jeton ou suivi par autre chose qu'un booléen", () => {
    expect(
      refused("project:logs", OWN_PAGE, 3, "srv", "app", "web", 100, true)
    ).toBe(true);
    expect(
      refused("project:logs", OWN_PAGE, "token", "srv", "app", "web", 100, 1)
    ).toBe(true);
    expect(refused("project:logs-cancel", OWN_PAGE, 3)).toBe(true);
  });

  it("laissent passer l'arrêt d'un journal par son jeton", () => {
    expect(refused("project:logs-cancel", OWN_PAGE, "token")).toBe(false);
  });
});

describe("les canaux des services", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("service:forwards", OTHER_PAGE, null)).toBe(true);
    expect(refused("service:logs-cancel", OTHER_PAGE, "token")).toBe(true);
  });

  it("refusent un argument de trop", () => {
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

  it("refusent un identifiant qui n'est pas un texte", () => {
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

  it("refusent un journal sans jeton ou suivi par autre chose qu'un booléen", () => {
    expect(refused("service:logs", OWN_PAGE, 3, "srv", "pg", 100, true)).toBe(
      true
    );
    expect(
      refused("service:logs", OWN_PAGE, "token", "srv", "pg", 100, "yes")
    ).toBe(true);
    expect(refused("service:logs-cancel", OWN_PAGE, 3)).toBe(true);
  });

  it("laissent passer la liste des redirections et l'arrêt d'un journal", () => {
    expect(refused("service:forwards", OWN_PAGE, null)).toBe(false);
    expect(refused("service:logs-cancel", OWN_PAGE, "token")).toBe(false);
  });
});

describe("les canaux du catalogue", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("catalog:secret-forget", OTHER_PAGE, "srv")).toBe(true);
  });

  it("refusent un argument de trop", () => {
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

  it("refusent un module, une clé ou un secret qui n'est pas un texte", () => {
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

describe("les canaux de l'installation", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("install:report", OTHER_PAGE, "srv")).toBe(true);
  });

  it("refusent un argument de trop", () => {
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

  it("refusent un flux sans jeton", () => {
    expect(refused("install:start", OWN_PAGE, 3, "srv", ["pg"], {}, [])).toBe(
      true
    );
    expect(refused("install:agent-send", OWN_PAGE, null, "srv")).toBe(true);
  });

  it("refusent une configuration qui n'est pas un objet", () => {
    expect(
      refused("install:start", OWN_PAGE, "token", "srv", ["pg"], "x", [])
    ).toBe(true);
    expect(refused("install:check", OWN_PAGE, "srv", ["pg"], null, [])).toBe(
      true
    );
  });

  it("refusent des modules différés qui ne sont pas des noms", () => {
    expect(
      refused("install:start", OWN_PAGE, "token", "srv", ["pg"], {}, [3])
    ).toBe(true);
    expect(refused("install:check", OWN_PAGE, "srv", ["pg"], {}, "pg")).toBe(
      true
    );
  });
});
