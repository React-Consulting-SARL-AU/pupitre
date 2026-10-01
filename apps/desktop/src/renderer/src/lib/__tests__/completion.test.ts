import { describe, expect, it } from "bun:test";
import type { CompletionsResult } from "@pupitre/shared/agent-protocol/state";
import { translator } from "@renderer/i18n/i18n";
import { insertion, propose, split, underRoot } from "../completion";

const FR = translator("fr");
const EN = translator("en");

const GRAMMAR: CompletionsResult = {
  command: "pupitred",
  sub: [
    {
      args: [["$project"]],
      help: "démarre un projet",
      name: "up",
    },
    {
      args: [["$project"], ["$process"], ["--follow"]],
      help: "lit son journal",
      name: "logs",
    },
  ],
  projects: ["flyleaf-api", "atlas-web"],
  root: "/home/dev/projects",
  path: "",
  paths: ["flyleaf/", "atlas/"],
};

const SOURCES = {
  catalog: GRAMMAR,
  history: ["git status", "pupitred up flyleaf-api"],
  paths: ["src/", "src/lib.ts"],
  processes: { "atlas-web": ["web"], "flyleaf-api": ["api", "worker"] },
  projects: ["flyleaf-api", "atlas-web"],
};

describe("split", () => {
  it("looks only at the last command on the line", () => {
    expect(split("cd atlas && pupitred up ")).toMatchObject({
      position: 2,
      token: "",
      tokens: ["pupitred", "up"],
    });
  });
});

describe("propose", () => {
  it("offers nothing on an empty line", () => {
    expect(propose("   ", SOURCES, FR).candidates).toEqual([]);
  });

  it("offers the agent's command in first position", () => {
    const { candidates } = propose("pup", SOURCES, FR);

    expect(candidates[0]).toMatchObject({
      help: "la commande de l'agent",
      kind: "command",
      text: "pupitred",
    });
  });

  it("names its own suggestions in the app's language", () => {
    expect(propose("pup", SOURCES, EN).candidates[0].help).toBe(
      "the agent's command"
    );
    expect(propose("pupitred up ", SOURCES, EN).candidates[0].help).toBe(
      "project"
    );
    expect(
      propose("pupitred logs flyleaf-api ", SOURCES, EN).candidates[0].help
    ).toBe("process");
  });

  it("offers the subcommands the grammar declares", () => {
    const { candidates } = propose("pupitred ", SOURCES, FR);

    const grammar = candidates.filter((c) => c.kind === "argument");

    expect(grammar.map((c) => c.text)).toEqual(["up", "logs"]);
    expect(grammar[0].help).toBe("démarre un projet");
  });

  it("replaces $project with the projects the server named", () => {
    const { candidates } = propose("pupitred up ", SOURCES, FR);

    const projects = candidates.filter((c) => c.kind === "argument");

    expect(projects.map((c) => c.text)).toEqual(["flyleaf-api", "atlas-web"]);
    expect(projects[0].help).toBe("projet");
  });

  it("replaces $process with the processes of the project typed just before", () => {
    const { candidates } = propose("pupitred logs flyleaf-api ", SOURCES, FR);

    const processes = candidates.filter((c) => c.kind === "argument");

    expect(processes.map((c) => c.text)).toEqual(["api", "worker"]);
    expect(processes[0].help).toBe("processus");
    expect(
      propose("pupitred logs ghost ", SOURCES, FR).candidates.filter(
        (c) => c.kind === "argument"
      )
    ).toEqual([]);
  });

  it("offers the paths the server listed when the token is one", () => {
    const { candidates } = propose("cat src/", SOURCES, FR);

    expect(candidates.map((c) => c.text)).toContain("src/lib.ts");
  });

  it("returns the rest of the history entry that starts like the line", () => {
    const { ghost } = propose("git st", SOURCES, FR);

    expect(ghost).toBe("atus");
  });

  it("never offers the token already typed", () => {
    const { candidates } = propose("pupitred up flyleaf-api", SOURCES, FR);

    expect(candidates.map((c) => c.text)).not.toContain("flyleaf-api");
  });
});

describe("underRoot", () => {
  const ROOT = "/home/dev/projects";

  it("returns the requested folder relative to the projects root", () => {
    expect(underRoot(ROOT, "/home/dev/projects/flyleaf", "api/")).toBe(
      "flyleaf/api"
    );
  });

  it("returns an empty string for the root itself", () => {
    expect(underRoot(ROOT, ROOT, "")).toBe("");
  });

  it("follows an absolute path given by the token", () => {
    expect(underRoot(ROOT, "/tmp", "/home/dev/projects/atlas/")).toBe("atlas");
  });

  it("asks for nothing outside the root, neither by folder nor by a ..", () => {
    expect(underRoot(ROOT, "/etc", "")).toBeNull();
    expect(
      underRoot(ROOT, "/home/dev/projects/flyleaf", "../../../")
    ).toBeNull();
  });
});

describe("insertion", () => {
  it("completes a folder without adding a space", () => {
    expect(insertion({ kind: "path", text: "src/" }, "cat sr", "sr")).toBe(
      "c/"
    );
  });

  it("replaces the whole line for a history entry", () => {
    expect(
      insertion({ kind: "history", text: "git status" }, "git st", "st")
    ).toBe("atus");
  });
});
