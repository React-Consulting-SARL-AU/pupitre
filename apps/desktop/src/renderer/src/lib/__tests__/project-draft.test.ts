import { describe, expect, it } from "bun:test";
import {
  folderFromSource,
  freePort,
  isGitSource,
  nameFromSource,
  portFromRemedy,
  startCommand,
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
