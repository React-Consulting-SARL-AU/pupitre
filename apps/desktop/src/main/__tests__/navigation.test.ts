import { describe, expect, it } from "bun:test";
import { openable, ownPage } from "../navigation";

const INDEX =
  "/Applications/Pupitre.app/Contents/Resources/renderer/index.html";

describe("ce que le navigateur peut ouvrir", () => {
  it("laisse partir vers une adresse https, empaqueté ou non", () => {
    expect(openable("https://app.pupitre.studio/dashboard", true)).toBe(true);
    expect(openable("https://github.com/login/device", false)).toBe(true);
  });

  it("n'ouvre la console locale en clair qu'en développement", () => {
    expect(openable("http://localhost:3000/auth/device", false)).toBe(true);
    expect(openable("http://localhost:3000/auth/device", true)).toBe(false);
  });

  it("refuse tout autre schéma, et le http d'ailleurs", () => {
    expect(openable("http://example.com", false)).toBe(false);
    expect(openable("file:///etc/passwd", false)).toBe(false);
    expect(openable("javascript:alert(1)", true)).toBe(false);
    expect(openable("smb://nas/share", true)).toBe(false);
  });
});

describe("où la fenêtre peut naviguer", () => {
  it("reconnaît la page empaquetée, ancre comprise", () => {
    const rules = { devUrl: undefined, indexFile: INDEX };

    expect(ownPage(`file://${INDEX}`, rules)).toBe(true);
    expect(ownPage(`file://${INDEX}#/projects`, rules)).toBe(true);
  });

  it("reconnaît le serveur de développement quand il sert la page", () => {
    const rules = { devUrl: "http://localhost:5173", indexFile: INDEX };

    expect(ownPage("http://localhost:5173/", rules)).toBe(true);
    expect(ownPage("http://localhost:5173/#/settings", rules)).toBe(true);
    expect(ownPage("http://localhost:5174/", rules)).toBe(false);
  });

  it("refuse tout ce qui n'est pas la page de l'app", () => {
    const rules = { devUrl: "http://localhost:5173", indexFile: INDEX };

    expect(ownPage("https://app.pupitre.studio/", rules)).toBe(false);
    expect(ownPage("file:///etc/hosts", rules)).toBe(false);
    expect(ownPage("file:///Applications/Pupitre.app/other.html", rules)).toBe(
      false
    );
    expect(ownPage("javascript:void(0)", rules)).toBe(false);
    expect(ownPage("not a url", rules)).toBe(false);
  });
});
