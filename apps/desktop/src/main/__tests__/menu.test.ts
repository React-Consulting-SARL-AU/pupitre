import { describe, expect, it } from "bun:test";
import type { MenuItemConstructorOptions } from "electron";
import { menuTemplate } from "../menu";

function roles(items: MenuItemConstructorOptions[]): string[] {
  return items.flatMap((item) => [
    ...(item.role ? [String(item.role)] : []),
    ...(Array.isArray(item.submenu) ? roles(item.submenu) : []),
  ]);
}

function items(
  list: MenuItemConstructorOptions[]
): MenuItemConstructorOptions[] {
  return list.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? items(item.submenu) : []),
  ]);
}

function byId(
  list: MenuItemConstructorOptions[],
  id: string
): MenuItemConstructorOptions | undefined {
  return items(list).find((item) => item.id === id);
}

describe("le menu de l'application", () => {
  it("garde l'édition, pour copier et coller partout", () => {
    expect(roles(menuTemplate("darwin", true, "en-US"))).toContain("editMenu");
    expect(roles(menuTemplate("linux", true, "en-US"))).toContain("editMenu");
  });

  it("n'offre les outils de développement qu'à un build non empaqueté", () => {
    expect(roles(menuTemplate("darwin", true, "en-US"))).not.toContain(
      "toggleDevTools"
    );
    expect(roles(menuTemplate("darwin", false, "en-US"))).toContain(
      "toggleDevTools"
    );
  });

  it("nomme le menu d'affichage dans la langue du système", () => {
    const label = (locale: string) =>
      menuTemplate("darwin", true, locale).find((item) => item.label)?.label;

    expect(label("fr-FR")).toBe("Présentation");
    expect(label("en-US")).toBe("View");
  });

  it("porte le menu de l'app sur macOS seulement", () => {
    expect(roles(menuTemplate("darwin", true, "en-US"))[0]).toBe("appMenu");
    expect(roles(menuTemplate("win32", true, "en-US"))).not.toContain(
      "appMenu"
    );
  });

  it("porte les préférences, le nouveau terminal et la palette avec leurs raccourcis", () => {
    const menu = menuTemplate("darwin", true, "en-US");

    expect(byId(menu, "preferences")?.accelerator).toBe("CmdOrCtrl+,");
    expect(byId(menu, "new-terminal")?.accelerator).toBe("CmdOrCtrl+T");
    expect(byId(menu, "new-agent")?.accelerator).toBe("CmdOrCtrl+Shift+T");
    expect(byId(menu, "go-to-project")?.accelerator).toBe("CmdOrCtrl+K");
    expect(byId(menu, "shortcuts")?.accelerator).toBe("CmdOrCtrl+/");
    expect(byId(menu, "check-updates")).toBeDefined();
    expect(byId(menu, "sign-out")).toBeDefined();
  });

  it("appelle le geste qu'on lui donne, et rien d'autre", () => {
    const called: string[] = [];
    const menu = menuTemplate("linux", true, "fr-FR", {
      checkUpdates: () => called.push("updates"),
      goToProject: () => called.push("palette"),
      help: (link) => called.push(`help:${link}`),
      newAgent: () => called.push("agent"),
      newTerminal: () => called.push("terminal"),
      preferences: () => called.push("preferences"),
      shortcuts: () => called.push("shortcuts"),
      signOut: () => called.push("sign-out"),
    });

    for (const id of [
      "preferences",
      "new-terminal",
      "new-agent",
      "go-to-project",
      "shortcuts",
      "check-updates",
      "sign-out",
      "help-docs",
      "help-support",
      "help-legal",
    ]) {
      (byId(menu, id)?.click as (() => void) | undefined)?.();
    }

    expect(called).toEqual([
      "preferences",
      "terminal",
      "agent",
      "palette",
      "shortcuts",
      "updates",
      "sign-out",
      "help:docs",
      "help:support",
      "help:legal",
    ]);
  });

  it("mène de l'aide à la documentation, au support et aux conditions, dans la langue du système", () => {
    const labels = (locale: string) =>
      ["help-docs", "help-support", "help-legal"].map(
        (id) => byId(menuTemplate("darwin", true, locale), id)?.label
      );

    expect(labels("fr-FR")).toEqual([
      "Documentation",
      "Contacter le support",
      "Conditions et confidentialité",
    ]);
    expect(labels("en-US")).toEqual([
      "Documentation",
      "Contact Support",
      "Terms and Privacy",
    ]);
  });

  it("place les raccourcis sous le menu d'aide, dans la langue du système", () => {
    const help = (locale: string) =>
      menuTemplate("win32", true, locale).find((item) => item.role === "help");

    expect(help("fr-FR")?.label).toBe("Aide");
    expect(help("en-US")?.label).toBe("Help");
    expect(
      items(help("fr-FR")?.submenu as MenuItemConstructorOptions[]).find(
        (item) => item.id === "shortcuts"
      )?.label
    ).toBe("Raccourcis clavier");
  });

  it("libelle ses entrées dans la langue du système", () => {
    expect(
      byId(menuTemplate("darwin", true, "fr-FR"), "preferences")?.label
    ).toBe("Réglages…");
    expect(byId(menuTemplate("darwin", true, "en-US"), "sign-out")?.label).toBe(
      "Sign Out…"
    );
    expect(
      byId(menuTemplate("win32", true, "fr-FR"), "new-terminal")?.label
    ).toBe("Nouveau terminal");
  });

  it("place les entrées de compte sous le menu de l'app sur macOS, sous Fichier ailleurs", () => {
    const mac = menuTemplate("darwin", true, "en-US");
    const win = menuTemplate("win32", true, "en-US");

    expect(items(mac.slice(0, 1)).some((item) => item.id === "sign-out")).toBe(
      true
    );
    expect(items(win.slice(0, 1)).some((item) => item.id === "sign-out")).toBe(
      true
    );
    expect(win[0]?.role).toBe("fileMenu");
  });
});
