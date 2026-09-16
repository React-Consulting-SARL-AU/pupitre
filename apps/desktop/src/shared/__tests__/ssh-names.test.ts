import { describe, expect, it } from "bun:test";
import { REMOTE_EDITORS, remoteEditorUrl } from "../editors";
import type { Server } from "../servers";
import { alias, sshNames, sshSlug } from "../ssh-names";

const ATELIER: Server = {
  host: "203.0.113.10",
  id: "srv-mfx2k1",
  keyPath: "/data/keys/srv-mfx2k1",
  name: "Atelier",
  origin: "app",
  port: 2222,
  user: "dev",
};

const SYSTEM: Server = {
  host: "dev-vps",
  id: "srv-b",
  name: "Poste de travail",
  origin: "system",
  port: 22,
  user: "",
};

describe("le nom d'un serveur sur une ligne Host", () => {
  it("est son nom, en minuscules sans accent ni espace", () => {
    expect(sshSlug("Atelier")).toBe("atelier");
    expect(sshSlug("Serveur d'Été 2")).toBe("serveur-d-ete-2");
    expect(sshSlug("  --VPS--  ")).toBe("vps");
  });

  it("n'existe pas quand rien du nom ne tient sur la ligne, ni quand il singe un alias", () => {
    expect(sshSlug("···")).toBeNull();
    expect(sshSlug("pupitre-srv-x")).toBeNull();
  });
});

describe("les noms que les serveurs se partagent", () => {
  it("donnent à chaque serveur de l'app son nom, et à un hôte du système le sien", () => {
    const names = sshNames([ATELIER, SYSTEM], []);

    expect(names.get(ATELIER.id)).toBe("atelier");
    expect(names.get(SYSTEM.id)).toBe("dev-vps");
  });

  it("laissent l'alias seul à un serveur dont le nom est déjà pris", () => {
    const twin = { ...ATELIER, id: "srv-2", name: "atelier" };

    const names = sshNames([ATELIER, twin], []);

    expect(names.get(ATELIER.id)).toBe("atelier");
    expect(names.get(twin.id)).toBe(alias(twin));
  });

  it("ne prennent jamais un hôte que le fichier du système déclare", () => {
    const names = sshNames([ATELIER], ["atelier"]);

    expect(names.get(ATELIER.id)).toBe("pupitre-srv-mfx2k1");
  });

  it("ne prennent pas non plus l'alias d'un hôte du système désigné", () => {
    const named = { ...ATELIER, name: "dev-vps" };

    const names = sshNames([SYSTEM, named], []);

    expect(names.get(named.id)).toBe(alias(named));
  });
});

describe("le lien d'un éditeur", () => {
  const byId = Object.fromEntries(REMOTE_EDITORS.map((e) => [e.id, e]));

  it("nomme le serveur par le mot que le fichier du système résout, et rien d'autre", () => {
    expect(remoteEditorUrl(byId.zed, ATELIER, "atelier", "/home/dev/api")).toBe(
      "zed://ssh/atelier/home/dev/api"
    );
    expect(
      remoteEditorUrl(byId.vscode, ATELIER, "atelier", "/home/dev/api")
    ).toBe("vscode://vscode-remote/ssh-remote+atelier/home/dev/api");
    expect(
      remoteEditorUrl(byId.cursor, ATELIER, "atelier", "/home/dev/api")
    ).toBe("cursor://vscode-remote/ssh-remote+atelier/home/dev/api");
  });

  it("donne à Gateway le port et le compte que le bloc dit", () => {
    expect(
      remoteEditorUrl(byId.jetbrains, ATELIER, "atelier", "/home/dev/api")
    ).toBe(
      "jetbrains-gateway://connect#type=ssh&host=atelier&port=2222&user=dev&projectPath=%2Fhome%2Fdev%2Fapi"
    );
  });

  it("laisse un hôte du système à son alias, sans compte", () => {
    expect(
      remoteEditorUrl(byId.jetbrains, SYSTEM, "dev-vps", "/home/dev/api")
    ).toBe(
      "jetbrains-gateway://connect#type=ssh&host=dev-vps&port=22&user=&projectPath=%2Fhome%2Fdev%2Fapi"
    );
  });

  it("refuse un chemin qui n'est pas absolu", () => {
    expect(remoteEditorUrl(byId.zed, ATELIER, "atelier", "../etc")).toBeNull();
  });
});
