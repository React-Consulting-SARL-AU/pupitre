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

describe("la source d'un projet", () => {
  it("reconnaît une adresse de dépôt d'un chemin de dossier", () => {
    expect(isGitSource("https://github.com/vitejs/vite.git")).toBe(true);
    expect(isGitSource("git@github.com:moi/mon-site.git")).toBe(true);
    expect(isGitSource("apps/web")).toBe(false);
  });

  it("déduit le nom du dernier segment de l'adresse", () => {
    expect(nameFromSource("https://github.com/vitejs/vite-starter.git")).toBe(
      "vite-starter"
    );
    expect(nameFromSource("git@github.com:moi/Mon_Site.git")).toBe("mon_site");
    expect(nameFromSource("https://example.org/me/my-site/")).toBe("my-site");
  });

  it("déduit le nom du dernier segment d'un dossier", () => {
    expect(nameFromSource("apps/web")).toBe("web");
  });

  it("rend un nom que le registre accepte", () => {
    const name = nameFromSource("https://example.org/me/--Étrange Nom--.git");

    expect(name).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
  });

  it("garde le chemin donné quand la source est un dossier", () => {
    expect(folderFromSource("apps/web", "web")).toBe("apps/web");
    expect(folderFromSource("https://example.org/me/site.git", "site")).toBe(
      "site"
    );
  });

  it("refuse un chemin absolu ou remontant et retombe sur le nom", () => {
    expect(folderFromSource("/etc/passwd", "site")).toBe("etc/passwd");
    expect(folderFromSource("../../etc", "site")).toBe("site");
  });
});

describe("le sous-domaine proposé", () => {
  it("replie le point et le souligné d'un nom sur un tiret", () => {
    expect(subdomainFromName("my.site")).toBe("my-site");
    expect(subdomainFromName("my_site")).toBe("my-site");
    expect(subdomainFromName("pupitre.studio")).toBe("pupitre-studio");
  });

  it("ne rend ni double tiret ni tiret aux extrémités", () => {
    expect(subdomainFromName("--mon..site__")).toBe("mon-site");
    expect(subdomainFromName("...")).toBe("");
  });

  it("rend un sous-domaine que l'agent accepte à partir d'un nom qu'il accepte", () => {
    for (const name of ["my.site", "my_site", "a.b.c", "x--y"]) {
      expect(validSubdomain(subdomainFromName(name))).toBe(true);
    }
  });

  it("suffixe tant que le nom est pris", () => {
    expect(freeSubdomain("my.site", [])).toBe("my-site");
    expect(freeSubdomain("my.site", ["my-site"])).toBe("my-site-2");
    expect(freeSubdomain("my.site", ["my-site", "my-site-2"])).toBe(
      "my-site-3"
    );
  });

  it("ne propose rien quand le nom ne porte aucune lettre ni chiffre", () => {
    expect(freeSubdomain("...", ["x"])).toBe("");
  });
});

describe("un sous-domaine saisi", () => {
  it("accepte une étiquette et plusieurs séparées par des points", () => {
    expect(validSubdomain("shop")).toBe(true);
    expect(validSubdomain("api.shop")).toBe(true);
  });

  it("refuse ce que le DNS ne porterait pas", () => {
    for (const value of ["", "-shop", "shop-", ".shop", "shop.", "a..b", "A"]) {
      expect(validSubdomain(value)).toBe(false);
    }
  });

  it("signale plusieurs niveaux sans les refuser", () => {
    expect(spansSeveralLevels("api.shop")).toBe(true);
    expect(spansSeveralLevels("shop")).toBe(false);
  });
});

describe("le port proposé", () => {
  it("prend le premier port qu'aucun projet déclaré ne tient", () => {
    expect(freePort([3000, 3001])).toBe(3002);
    expect(freePort([])).toBe(3000);
  });

  it("prend le port libre dans le champ du remède, jamais dans une phrase", () => {
    expect(portFromRemedy({ code: "port_taken", port_free: 3001 })).toBe(3001);
  });

  it("ne trouve aucun port quand l'erreur ne porte pas de remède", () => {
    expect(portFromRemedy(undefined)).toBeNull();
  });
});

describe("la commande de démarrage proposée", () => {
  it("suit le gestionnaire de paquets et le port", () => {
    expect(startCommand("bun", 3000)).toBe("bun run dev --port 3000");
    expect(startCommand("npm", 3100)).toBe("npm run dev -- --port 3100");
  });

  it("ne propose rien quand le gestionnaire n'installe rien", () => {
    expect(startCommand("none", 3000)).toBe("");
    expect(startCommand("service", 3000)).toBe("");
  });
});
