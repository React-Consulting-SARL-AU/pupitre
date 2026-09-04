import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BRANCHES,
  DIFF,
  GIT_STATUS,
  SNAPSHOT,
  WORKING_TREE,
} from "../../__tests__/snapshot-fixtures";
import { remoteEditors } from "../../lib/modules";
import { ProjectDiff } from "../projects/project-diff";
import { ProjectEditors } from "../projects/project-editors";
import { ProjectHeader } from "../projects/project-header";
import { ProjectOverview } from "../projects/project-overview";
import { ProjectTabBar } from "../projects/project-tab-bar";
import { tabsFor } from "../projects/project-tabs";

/**
 * A project's screens, rendered from the same `snapshot` fixture as the
 * dashboard, plus what its own commands answer.
 */

const NOOP = () => undefined;

const PROJECT = SNAPSHOT.projects[0];

const STOPPED = SNAPSHOT.projects[1];

describe("l'en-tête d'un projet", () => {
  it("montre l'état, la branche et l'écart avec le dépôt distant", () => {
    const html = renderToStaticMarkup(
      <ProjectHeader
        busy={false}
        editors={null}
        git={GIT_STATUS}
        onAct={NOOP}
        onSeeDiff={NOOP}
        onSync={NOOP}
        project={PROJECT}
        syncing={false}
      >
        {null}
      </ProjectHeader>
    );

    expect(html).toContain("flymate-api");
    expect(html).toContain('data-state="online"');
    expect(html).toContain("main");
    expect(html).toContain("2 changements");
    expect(html).toContain("↓3");
    expect(html).toContain("↑1");
    expect(html).toContain("Redémarrer");
    expect(html).toContain("Synchroniser");
  });

  it("propose de démarrer un projet arrêté, pas de l'arrêter", () => {
    const html = renderToStaticMarkup(
      <ProjectHeader
        busy={false}
        editors={null}
        git={null}
        onAct={NOOP}
        onSeeDiff={NOOP}
        onSync={NOOP}
        project={STOPPED}
        syncing={false}
      >
        {null}
      </ProjectHeader>
    );

    expect(html).toContain("Démarrer");
    expect(html).not.toContain("Arrêter");
  });
});

describe("les onglets d'un projet", () => {
  it("ne proposent que les agents installés sur cette machine", () => {
    const tabs = tabsFor({ agents: ["claude"], repo: true });

    expect(tabs).toEqual(["overview", "logs", "diff", "shell", "claude"]);
  });

  it("retirent le diff d'un dossier qui n'est pas un dépôt", () => {
    expect(tabsFor({ agents: [], repo: false })).not.toContain("diff");
  });

  it("portent le nombre de fichiers changés", () => {
    const html = renderToStaticMarkup(
      <ProjectTabBar
        active="overview"
        counts={{ diff: GIT_STATUS.changed }}
        onSelect={NOOP}
        sessions={{}}
        states={{}}
        tabs={tabsFor({ agents: ["claude"], repo: true })}
      />
    );

    expect(html).toContain("Vue d&#x27;ensemble");
    expect(html).toContain("Journal");
    expect(html).toContain("Claude");
    expect(html).toContain(">2<");
  });
});

describe("la vue d'ensemble d'un projet", () => {
  it("rend l'adresse, les branches, les commandes et la mémoire", () => {
    const html = renderToStaticMarkup(
      <ProjectOverview
        branches={{ branches: BRANCHES, status: "read" }}
        git={{ at: Date.now(), git: GIT_STATUS, status: "read" }}
        onCheckGit={NOOP}
        onCheckout={NOOP}
        onRemove={NOOP}
        project={PROJECT}
        switching={false}
      />
    );

    expect(html).toContain("flymate.example.org");
    expect(html).toContain("127.0.0.1:3000");
    expect(html).toContain("feat/tarifs");
    expect(html).toContain("bun run dev --port 3000");
    expect(html).toContain("412 Mo");
    expect(html).toContain("3 commits à récupérer");
  });

  it("dit d'où vient la commande d'installation que l'agent n'a pas écrite", () => {
    const html = renderToStaticMarkup(
      <ProjectOverview
        branches={{ status: "idle" }}
        git={{ status: "idle" }}
        onCheckGit={NOOP}
        onCheckout={NOOP}
        onRemove={NOOP}
        project={PROJECT}
        switching={false}
      />
    );

    expect(html).toContain("dérivée de bun");
    expect(html).toContain("interrogation du dépôt distant");
  });
});

describe("le diff d'un projet", () => {
  it("groupe les fichiers comme git les groupe", () => {
    const html = renderToStaticMarkup(
      <ProjectDiff
        diff={{ diff: DIFF, path: DIFF.path, status: "read" }}
        onReload={NOOP}
        onRetryDiff={NOOP}
        onSelect={NOOP}
        selected={DIFF.path}
        tree={{ status: "read", tree: WORKING_TREE }}
      />
    );

    expect(html).toContain("indexés");
    expect(html).toContain("modifiés");
    expect(html).toContain("nouveaux");
    expect(html).toContain("tva.ts");
    expect(html).toContain("lecture seule");
  });

  it("marque les lignes du patch par leur signe autant que par leur fond", () => {
    const html = renderToStaticMarkup(
      <ProjectDiff
        diff={{ diff: DIFF, path: DIFF.path, status: "read" }}
        onReload={NOOP}
        onRetryDiff={NOOP}
        onSelect={NOOP}
        selected={DIFF.path}
        tree={{ status: "read", tree: WORKING_TREE }}
      />
    );

    expect(html).toContain('data-kind="add"');
    expect(html).toContain('data-kind="remove"');
    expect(html).toContain('data-kind="hunk"');
  });

  it("le dit quand le dossier n'est pas un dépôt", () => {
    const html = renderToStaticMarkup(
      <ProjectDiff
        diff={{ status: "idle" }}
        onReload={NOOP}
        onRetryDiff={NOOP}
        onSelect={NOOP}
        selected={null}
        tree={{
          status: "read",
          tree: { ...WORKING_TREE, files: [], repo: false },
        }}
      />
    );

    expect(html).toContain("n&#x27;est pas un dépôt git");
  });
});

describe("les éditeurs distants", () => {
  it("ne proposent que ceux dont le module est installé", () => {
    const html = renderToStaticMarkup(
      <ProjectEditors
        editors={remoteEditors(SNAPSHOT.services)}
        onOpen={NOOP}
        root={GIT_STATUS.root}
      />
    );

    expect(html).toContain("JetBrains Gateway");
    expect(html).not.toContain("VS Code");
    expect(html).not.toContain("Zed");
  });

  it("n'affichent rien tant que l'agent n'a pas donné de chemin absolu", () => {
    const html = renderToStaticMarkup(
      <ProjectEditors
        editors={remoteEditors(SNAPSHOT.services)}
        onOpen={NOOP}
        root={null}
      />
    );

    expect(html).toBe("");
  });
});
