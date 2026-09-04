import { describe, expect, it } from "bun:test";
import type { CompletionsResult } from "@pupitre/shared/agent-protocol/state";
import { insertion, propose, split } from "../completion";

/**
 * What completion offers, source by source.
 *
 * `propose` used to be one function branching on everything at once; it is four
 * named ones now, and each is exercised on its own here — the grammar of the
 * agent, the paths of the disk, the history of the shell.
 */

const GRAMMAR: CompletionsResult = {
  command: "pupitred",
  sub: [
    {
      args: [["$project"]],
      help: "démarre un projet",
      name: "up",
    },
    {
      args: [["$project"], ["--follow"]],
      help: "lit son journal",
      name: "logs",
    },
  ],
};

const SOURCES = {
  catalog: GRAMMAR,
  history: ["git status", "pupitred up flymate-api"],
  paths: ["src/", "src/lib.ts"],
  projects: ["flymate-api", "atlas-web"],
};

describe("split", () => {
  it("ne regarde que la dernière commande de la ligne", () => {
    expect(split("cd atlas && pupitred up ")).toMatchObject({
      position: 2,
      token: "",
      tokens: ["pupitred", "up"],
    });
  });
});

describe("propose", () => {
  it("n'offre rien sur une ligne vide", () => {
    expect(propose("   ", SOURCES).candidates).toEqual([]);
  });

  it("offre la commande de l'agent en première position", () => {
    const { candidates } = propose("pup", SOURCES);

    expect(candidates[0]).toMatchObject({ kind: "command", text: "pupitred" });
  });

  it("offre les sous-commandes que la grammaire déclare", () => {
    const { candidates } = propose("pupitred ", SOURCES);

    const grammar = candidates.filter((c) => c.kind === "argument");

    expect(grammar.map((c) => c.text)).toEqual(["up", "logs"]);
    expect(grammar[0].help).toBe("démarre un projet");
  });

  it("remplace $project par les projets que le serveur a nommés", () => {
    const { candidates } = propose("pupitred up ", SOURCES);

    const projects = candidates.filter((c) => c.kind === "argument");

    expect(projects.map((c) => c.text)).toEqual(["flymate-api", "atlas-web"]);
    expect(projects[0].help).toBe("projet");
  });

  it("offre les chemins que le serveur a listés quand le jeton en est un", () => {
    const { candidates } = propose("cat src/", SOURCES);

    expect(candidates.map((c) => c.text)).toContain("src/lib.ts");
  });

  it("rend le reste de l'entrée d'historique qui commence comme la ligne", () => {
    const { ghost } = propose("git st", SOURCES);

    expect(ghost).toBe("atus");
  });

  it("n'offre jamais le jeton déjà tapé", () => {
    const { candidates } = propose("pupitred up flymate-api", SOURCES);

    expect(candidates.map((c) => c.text)).not.toContain("flymate-api");
  });
});

describe("insertion", () => {
  it("complète un dossier sans ajouter d'espace", () => {
    expect(insertion({ kind: "path", text: "src/" }, "cat sr", "sr")).toBe(
      "c/"
    );
  });

  it("remplace la ligne entière pour une entrée d'historique", () => {
    expect(
      insertion({ kind: "history", text: "git status" }, "git st", "st")
    ).toBe("atus");
  });
});
