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
    expect(propose("   ", SOURCES, FR).candidates).toEqual([]);
  });

  it("offre la commande de l'agent en première position", () => {
    const { candidates } = propose("pup", SOURCES, FR);

    expect(candidates[0]).toMatchObject({
      help: "la commande de l'agent",
      kind: "command",
      text: "pupitred",
    });
  });

  it("nomme ses propres suggestions dans la langue de l'app", () => {
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

  it("offre les sous-commandes que la grammaire déclare", () => {
    const { candidates } = propose("pupitred ", SOURCES, FR);

    const grammar = candidates.filter((c) => c.kind === "argument");

    expect(grammar.map((c) => c.text)).toEqual(["up", "logs"]);
    expect(grammar[0].help).toBe("démarre un projet");
  });

  it("remplace $project par les projets que le serveur a nommés", () => {
    const { candidates } = propose("pupitred up ", SOURCES, FR);

    const projects = candidates.filter((c) => c.kind === "argument");

    expect(projects.map((c) => c.text)).toEqual(["flyleaf-api", "atlas-web"]);
    expect(projects[0].help).toBe("projet");
  });

  it("remplace $process par les processus du projet tapé juste avant", () => {
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

  it("offre les chemins que le serveur a listés quand le jeton en est un", () => {
    const { candidates } = propose("cat src/", SOURCES, FR);

    expect(candidates.map((c) => c.text)).toContain("src/lib.ts");
  });

  it("rend le reste de l'entrée d'historique qui commence comme la ligne", () => {
    const { ghost } = propose("git st", SOURCES, FR);

    expect(ghost).toBe("atus");
  });

  it("n'offre jamais le jeton déjà tapé", () => {
    const { candidates } = propose("pupitred up flyleaf-api", SOURCES, FR);

    expect(candidates.map((c) => c.text)).not.toContain("flyleaf-api");
  });
});

describe("underRoot", () => {
  const ROOT = "/home/dev/projects";

  it("rend le dossier demandé relatif à la racine des projets", () => {
    expect(underRoot(ROOT, "/home/dev/projects/flyleaf", "api/")).toBe(
      "flyleaf/api"
    );
  });

  it("rend une chaîne vide pour la racine elle-même", () => {
    expect(underRoot(ROOT, ROOT, "")).toBe("");
  });

  it("suit un chemin absolu que le jeton donne", () => {
    expect(underRoot(ROOT, "/tmp", "/home/dev/projects/atlas/")).toBe("atlas");
  });

  it("ne demande rien hors de la racine, ni par le dossier ni par un ..", () => {
    expect(underRoot(ROOT, "/etc", "")).toBeNull();
    expect(
      underRoot(ROOT, "/home/dev/projects/flyleaf", "../../../")
    ).toBeNull();
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
