import { describe, expect, it } from "bun:test";
import type { PortForward } from "@shared/services";
import type { MenuItemConstructorOptions } from "electron";
import {
  BACKGROUND_ARGUMENT,
  backgroundNeeded,
  startsInBackground,
  trayTemplate,
} from "../background-run";
import { trayBitmap } from "../tray-icon";

const NOTHING_HELD = { agentsListening: false, keptForwards: 0 };
const AGENTS = { agentsListening: true, keptForwards: 0 };
const KEPT = { agentsListening: false, keptForwards: 1 };

const MAC_LOGIN = {
  argv: [],
  platform: "darwin" as const,
  wasOpenedAtLogin: true,
};
const MAC_BY_HAND = { ...MAC_LOGIN, wasOpenedAtLogin: false };

const FORWARD: PortForward = {
  id: "f1",
  kept: true,
  label: "intranet/server",
  localPort: 8081,
  remotePort: 8081,
  serverId: "srv-1",
};

function tray(
  forwards: PortForward[],
  agentsListening: boolean
): MenuItemConstructorOptions[] {
  return trayTemplate(
    "fr-FR",
    { agentsListening, forwards, serverName: () => "mclovin" },
    { open: () => undefined, quit: () => undefined }
  );
}

describe("staying in the background", () => {
  it("happens only while an agent of this computer or a kept forward needs the app", () => {
    expect(backgroundNeeded(NOTHING_HELD)).toBe(false);
    expect(backgroundNeeded(AGENTS)).toBe(true);
    expect(backgroundNeeded(KEPT)).toBe(true);
  });

  it("starts without a window only at a login launch that has something to hold", () => {
    expect(startsInBackground(MAC_LOGIN, AGENTS)).toBe(true);
    expect(startsInBackground(MAC_LOGIN, NOTHING_HELD)).toBe(false);
    expect(startsInBackground(MAC_BY_HAND, KEPT)).toBe(false);
  });

  it("starts without a window when asked by argument on macOS too", () => {
    expect(
      startsInBackground(
        { ...MAC_BY_HAND, argv: ["Pupitre", BACKGROUND_ARGUMENT] },
        KEPT
      )
    ).toBe(true);
  });

  it("tells a login launch on Windows by the argument its login item passes", () => {
    const windows = {
      argv: ["Pupitre.exe"],
      platform: "win32" as const,
      wasOpenedAtLogin: false,
    };

    expect(startsInBackground(windows, KEPT)).toBe(false);
    expect(
      startsInBackground(
        { ...windows, argv: ["Pupitre.exe", BACKGROUND_ARGUMENT] },
        KEPT
      )
    ).toBe(true);
  });
});

describe("the menu bar icon's menu", () => {
  it("opens the app, says what it holds, and quits it", () => {
    const menu = tray([FORWARD], true);

    expect(menu.map((item) => item.id ?? item.type)).toEqual([
      "open",
      "separator",
      "agents",
      "forward-f1",
      "separator",
      "quit",
    ]);
    expect(menu.find((item) => item.id === "forward-f1")).toMatchObject({
      enabled: false,
      label: "intranet/server sur mclovin → localhost:8081",
    });
    expect(menu.find((item) => item.id === "quit")?.label).toBe(
      "Quitter Pupitre"
    );
  });

  it("says a dropped forward is coming back", () => {
    const menu = tray([{ ...FORWARD, reconnecting: true }], false);

    expect(menu.find((item) => item.id === "forward-f1")?.label).toBe(
      "intranet/server sur mclovin : reconnexion"
    );
    expect(menu.some((item) => item.id === "agents")).toBe(false);
  });

  it("calls the gesture it is given", () => {
    const called: string[] = [];
    const menu = trayTemplate(
      "en-US",
      { agentsListening: false, forwards: [], serverName: String },
      { open: () => called.push("open"), quit: () => called.push("quit") }
    );

    for (const item of menu) {
      (item.click as (() => void) | undefined)?.();
    }

    expect(called).toEqual(["open", "quit"]);
    expect(menu.filter((item) => item.type === "separator")).toHaveLength(1);
  });
});

describe("the menu bar icon", () => {
  function alpha(pixels: Buffer, size: number, x: number, y: number): number {
    return pixels[(y * size + x) * 4 + 3] ?? -1;
  }

  it("draws the glyph in the ink it is given, on transparency", () => {
    const size = 36;
    const pixels = trayBitmap(size, 255);

    expect(pixels).toHaveLength(size * size * 4);
    expect(alpha(pixels, size, 0, 0)).toBe(0);
    expect(alpha(pixels, size, size / 2, size / 2)).toBe(0);
    expect(pixels.subarray(0, 3)).toEqual(Buffer.from([255, 255, 255]));
    expect(Math.max(...pixels.filter((_, i) => i % 4 === 3))).toBe(255);
  });

  it("draws the chevron's tip and the underscore", () => {
    const size = 36;
    const pixels = trayBitmap(size, 0);
    const toPixel = (unit: number) => Math.floor(((unit - 212) / 600) * size);

    expect(alpha(pixels, size, toPixel(440), toPixel(512))).toBeGreaterThan(
      200
    );
    expect(alpha(pixels, size, toPixel(640), toPixel(660))).toBeGreaterThan(
      200
    );
  });
});
