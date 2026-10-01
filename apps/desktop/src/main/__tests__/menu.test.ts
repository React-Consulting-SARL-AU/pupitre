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

describe("the application menu", () => {
  it("keeps Edit, for copy and paste everywhere", () => {
    expect(roles(menuTemplate("darwin", true, "en-US"))).toContain("editMenu");
    expect(roles(menuTemplate("linux", true, "en-US"))).toContain("editMenu");
  });

  it("only offers developer tools to an unpackaged build", () => {
    expect(roles(menuTemplate("darwin", true, "en-US"))).not.toContain(
      "toggleDevTools"
    );
    expect(roles(menuTemplate("darwin", false, "en-US"))).toContain(
      "toggleDevTools"
    );
  });

  it("names the View menu in the system language", () => {
    const label = (locale: string) =>
      menuTemplate("darwin", true, locale).find((item) => item.label)?.label;

    expect(label("fr-FR")).toBe("Présentation");
    expect(label("en-US")).toBe("View");
  });

  it("carries the app menu on macOS only", () => {
    expect(roles(menuTemplate("darwin", true, "en-US"))[0]).toBe("appMenu");
    expect(roles(menuTemplate("win32", true, "en-US"))).not.toContain(
      "appMenu"
    );
  });

  it("carries preferences, the new terminal and the palette with their shortcuts", () => {
    const menu = menuTemplate("darwin", true, "en-US");

    expect(byId(menu, "preferences")?.accelerator).toBe("CmdOrCtrl+,");
    expect(byId(menu, "new-terminal")?.accelerator).toBe("CmdOrCtrl+T");
    expect(byId(menu, "new-agent")?.accelerator).toBe("CmdOrCtrl+Shift+T");
    expect(byId(menu, "go-to-project")?.accelerator).toBe("CmdOrCtrl+K");
    expect(byId(menu, "shortcuts")?.accelerator).toBe("CmdOrCtrl+/");
    expect(byId(menu, "check-updates")).toBeDefined();
    expect(byId(menu, "sign-out")).toBeDefined();
  });

  it("calls the gesture it is given, and nothing else", () => {
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

  it("leads from Help to the documentation, support and terms, in the system language", () => {
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

  it("places the shortcuts under the Help menu, in the system language", () => {
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

  it("labels its entries in the system language", () => {
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

  it("places the account entries under the app menu on macOS, under File elsewhere", () => {
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
