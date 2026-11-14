import { describe, expect, it } from "bun:test";
import type { ProcessPatch } from "@pupitre/shared/agent-protocol/projects";
import type { Process, Project } from "@pupitre/shared/agent-protocol/state";
import { dialogTextIn } from "../dialogs";
import {
  addLines,
  detailText,
  removeLines,
  updateLines,
} from "../mcp-changes-run";

const say = (
  key: Parameters<typeof dialogTextIn>[1],
  values?: Record<string, string>
) => dialogTextIn("en", key, values);

const WEB: Process = {
  cmd: "bun dev",
  dir: ".",
  host: "127.0.0.1",
  id: "web",
  path: "/home/dev/shop",
  pkgmgr: "bun",
  port: 3200,
  routes: [{ hostname: "shop.example.dev", label: "site", port: 3200 }],
  state: "stopped",
};

const SHOP: Project = {
  boot: false,
  dir: "shop",
  name: "shop",
  path: "/home/dev/shop",
  processes: [WEB],
  protected: true,
  state: "stopped",
};

const WEB_PATCH: ProcessPatch = {
  cmd: "bun dev",
  dir: ".",
  host: "127.0.0.1",
  id: "web",
  pkgmgr: "bun",
  port: 3200,
  routes: [{ hostname: "shop.example.dev", label: "site", port: 3200 }],
};

function texts(lines: { text: string; under?: boolean }[]): string[] {
  return lines.map((one) => (one.under ? `  ${one.text}` : one.text));
}

describe("what the owner reads before a change", () => {
  it("says nothing changes when the patch matches the project", () => {
    expect(
      texts(updateLines(say, SHOP, { boot: false, processes: [WEB_PATCH] }))
    ).toEqual(["Nothing changes: the project already reads this way."]);
  });

  it("lists a new command, its restart and a new address under the process", () => {
    const lines = updateLines(say, SHOP, {
      processes: [
        {
          ...WEB_PATCH,
          cmd: "bun dev web",
          routes: [
            ...WEB_PATCH.routes,
            { hostname: "app.example.dev", label: "app", port: 3201 },
          ],
        },
      ],
    });

    expect(texts(lines)).toEqual([
      "Process web",
      "  Command: bun dev → bun dev web",
      "  Restarts with its new command",
      "  New address app.example.dev → port 3201",
    ]);
  });

  it("says a dropped install command falls back to the package manager's", () => {
    const lines = updateLines(
      say,
      { ...SHOP, processes: [{ ...WEB, install: "bun install" }] },
      { processes: [WEB_PATCH] }
    );

    expect(texts(lines)).toEqual([
      "Process web",
      "  Install command: bun install → the package manager's own",
    ]);
  });

  it("names a process that goes and one that arrives", () => {
    const lines = updateLines(say, SHOP, {
      processes: [{ ...WEB_PATCH, id: "api", port: 4000, routes: [] }],
    });

    expect(texts(lines)).toEqual([
      "New process api: bun dev, port 4000",
      "Process web stops and goes",
    ]);
  });

  it("warns when the addresses open to anyone", () => {
    expect(texts(updateLines(say, SHOP, { protected: false }))).toEqual([
      "Its addresses open to anyone, without an access key",
    ]);
  });

  it("describes the patch alone when the project cannot be read", () => {
    expect(texts(updateLines(say, null, { branch: "next" }))).toEqual([
      "Branch: none → next",
    ]);
  });

  it("describes a project to declare from its repository and processes", () => {
    const lines = addLines(say, {
      boot: false,
      branch: "main",
      dir: "shop",
      name: "shop",
      processes: [
        {
          cmd: "bun dev",
          dir: ".",
          host: "127.0.0.1",
          id: "web",
          pkgmgr: "bun",
          port: 3200,
          routes: [{ label: "site", port: 3200, subdomain: "shop" }],
        },
      ],
      protected: true,
      repo: "git@github.com:a/shop.git",
    });

    expect(texts(lines)).toEqual([
      "Repository: git@github.com:a/shop.git (main)",
      "New process web: bun dev, port 3200",
      "  New address shop → port 3200",
    ]);
  });

  it("says the folder stays when a project is removed", () => {
    expect(texts(removeLines(say, SHOP))).toEqual([
      "Its processes stop and its addresses go.",
      "The folder /home/dev/shop stays on the server.",
    ]);
  });

  it("draws headings with a bullet and their lines indented", () => {
    expect(
      detailText(
        [{ text: "Process web" }, { text: "Port: 1 → 2", under: true }],
        "Asked."
      )
    ).toBe("•  Process web\n    Port: 1 → 2\n\nAsked.");
  });
});
