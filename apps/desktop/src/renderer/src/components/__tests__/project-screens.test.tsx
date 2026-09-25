import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { mount } from "../../__tests__/dom";
import {
  BRANCHES,
  DIFF,
  GIT_STATUS,
  SNAPSHOT,
  WORKING_TREE,
} from "../../__tests__/snapshot-fixtures";
import { remoteEditors } from "../../lib/modules";
import { isMac } from "../../lib/platform";
import {
  agentChordLabel,
  projectChordLabel,
} from "../../lib/project-shortcuts";
import { ProjectActions } from "../projects/project-actions";
import { ProjectAddresses } from "../projects/project-addresses";
import { ProjectAgentsPicker } from "../projects/project-agents-picker";
import { ProjectDiff } from "../projects/project-diff";
import { ProjectEditors } from "../projects/project-editors";
import { ProjectMeta } from "../projects/project-meta";
import { ProjectOverview } from "../projects/project-overview";
import { ProjectTabBar } from "../projects/project-tab-bar";
import { tabOfKind, tabsFor } from "../projects/project-tabs";

/**
 * A project's screens, rendered from the same `snapshot` fixture as the
 * dashboard, plus what its own commands answer.
 */

const NOOP = () => undefined;
const RESOLVED = () => Promise.resolve();

const PROJECT = SNAPSHOT.projects[0];

const SESSION = {
  dir: null,
  dormant: false,
  project: PROJECT.name,
  session: null,
  title: "Session",
} as const;

const STOPPED = SNAPSHOT.projects[1];

describe("l'en-tête d'un projet", () => {
  it("montre l'état, la branche et ce qui n'est pas commité, sans l'écart distant", () => {
    const html = renderToStaticMarkup(
      <ProjectMeta git={GIT_STATUS} onSeeDiff={NOOP} project={PROJECT} />
    );

    expect(html).toContain('data-state="online"');
    expect(html).toContain("main");
    expect(html).toContain("2 changements");
    expect(html).not.toContain("↓3");
  });

  it("tait la branche d'un dossier qui n'est pas un dépôt", () => {
    const html = renderToStaticMarkup(
      <ProjectMeta git={null} onSeeDiff={NOOP} project={PROJECT} />
    );

    expect(html).toContain('data-state="online"');
    expect(html).not.toContain("<button");
  });

  it("relance un projet en ligne et le synchronise", () => {
    const html = renderToStaticMarkup(
      <ProjectActions
        busy={false}
        editors={null}
        onAct={NOOP}
        onRemove={() => Promise.resolve()}
        onSync={NOOP}
        project={PROJECT}
        syncing={false}
      />
    );

    expect(html).toContain("Redémarrer");
    expect(html).toContain("Arrêter");
    expect(html).toContain("Pull et réinstaller");
    expect(html).toContain("Retirer du registre");
  });

  it("propose de démarrer un projet arrêté, pas de l'arrêter", () => {
    const html = renderToStaticMarkup(
      <ProjectActions
        busy={false}
        editors={null}
        onAct={NOOP}
        onRemove={() => Promise.resolve()}
        onSync={NOOP}
        project={STOPPED}
        syncing={false}
      />
    );

    expect(html).toContain("Démarrer");
    expect(html).not.toContain("Arrêter");
  });
});

describe("les onglets d'un projet", () => {
  it("séparent les shells des agents, sous deux onglets", () => {
    expect(tabsFor({ repo: true })).toEqual([
      "overview",
      "configuration",
      "logs",
      "diff",
      "files",
      "terminals",
      "agents",
    ]);
  });

  it("retirent le diff d'un dossier qui n'est pas un dépôt", () => {
    expect(tabsFor({ repo: false })).not.toContain("diff");
  });

  it("renvoient un shell sous Terminaux et un agent sous Agents", () => {
    expect(tabOfKind("shell")).toBe("terminals");
    expect(tabOfKind("claude")).toBe("agents");
    expect(tabOfKind("codex")).toBe("agents");
  });

  it("portent le nombre de fichiers changés, de sessions ouvertes, et leur état", () => {
    const html = renderToStaticMarkup(
      <ProjectTabBar
        active="overview"
        counts={{ agents: 2, diff: GIT_STATUS.changed, terminals: 1 }}
        onSelect={NOOP}
        sessions={{
          agents: [
            { ...SESSION, id: "t2", kind: "claude" },
            { ...SESSION, id: "t3", kind: "codex" },
          ],
          terminals: [{ ...SESSION, id: "t1", kind: "shell" }],
        }}
        states={{ t2: "attention" }}
        tabs={tabsFor({ repo: true })}
      />
    );

    expect(html).toContain("Vue d&#x27;ensemble");
    expect(html).toContain("Logs");
    expect(html).toContain("Terminaux");
    expect(html).toContain("Agents");
    expect(html).not.toContain("Claude");
    expect(html).toContain(">1<");
    expect(html).toContain(">2<");
    expect(html).toContain('data-shape="ringed"');
  });

  it("disent sur chaque onglet le raccourci qui y mène", () => {
    const html = renderToStaticMarkup(
      <ProjectTabBar
        active="overview"
        counts={{}}
        onSelect={NOOP}
        sessions={{}}
        states={{}}
        tabs={tabsFor({ repo: false })}
      />
    );
    const chord = projectChordLabel(isMac);

    expect(html).toContain(`data-tooltip="${chord}1"`);
    expect(html).toContain(`data-tooltip="${chord}6"`);
    expect(html).not.toContain(`data-tooltip="${chord}7"`);
  });
});

describe("le choix d'un agent", () => {
  it("offre une carte par agent que la machine tient, sous le logo de son module, et lance celui qu'on presse", async () => {
    const picked: string[] = [];
    const view = await mount(
      <ProjectAgentsPicker
        agents={[
          {
            agent: "claude",
            moduleId: "ai.claude",
            name: "Claude Code",
            version: "2.1.0",
          },
          {
            agent: "codex",
            moduleId: "ai.codex",
            name: "Codex",
            version: null,
          },
        ]}
        onInstall={NOOP}
        onPick={(agent) => picked.push(agent)}
      />
    );

    const buttons = [
      ...view.container.querySelectorAll("[data-agents-picker] button"),
    ];

    expect(buttons.map((button) => button.textContent)).toEqual([
      `Claude CodeClaudeClaude Code · 2.1.0${agentChordLabel(isMac)}`,
      "CodexCodexCodex",
    ]);
    expect(buttons[0]?.getAttribute("aria-keyshortcuts")).toBe(
      agentChordLabel(isMac)
    );
    expect(view.html()).toContain('data-logo="ai.claude"');
    expect(view.html()).toContain('data-logo="ai.codex"');
    expect(view.text()).toContain("Lancer un agent");

    await view.click(buttons[1]);

    expect(picked).toEqual(["codex"]);

    view.unmount();
  });

  it("dit où un agent s'installe quand la machine n'en tient aucun", async () => {
    let asked = 0;
    const view = await mount(
      <ProjectAgentsPicker
        agents={[]}
        onInstall={() => {
          asked += 1;
        }}
        onPick={NOOP}
      />
    );

    expect(view.text()).toContain("Aucun agent installé sur ce serveur");
    expect(view.container.querySelector("[data-agents-picker]")).toBeNull();

    await view.click(view.container.querySelector("button"));

    expect(asked).toBe(1);

    view.unmount();
  });
});

describe("la vue d'ensemble d'un projet", () => {
  it("rend l'adresse, les branches, les processus et la mémoire", () => {
    const html = renderToStaticMarkup(
      <ProjectOverview
        branches={{ branches: BRANCHES, status: "read" }}
        busy={false}
        env={{ status: "idle" }}
        git={{ at: Date.now(), git: GIT_STATUS, status: "read" }}
        onAct={NOOP}
        onCheckGit={NOOP}
        onCheckout={RESOLVED}
        onConfigure={NOOP}
        onReadEnv={NOOP}
        onRegenerateEnv={() => Promise.resolve()}
        onSync={NOOP}
        project={PROJECT}
        switching={false}
        syncing={false}
      />
    );

    expect(html).toContain("flyleaf.example.org");
    expect(html).toContain("api-flyleaf.example.org");
    expect(html).toContain('data-addresses="2"');
    expect(html).toContain("Publier un autre port");
    expect(html).toContain('id="project-branch"');
    expect(html).toContain("bun run dev --port 3000");
    expect(html).toContain("412 Mo");
    expect(html).toContain('data-processes="1"');
    expect(html).toContain('data-process="flyleaf-api"');
    expect(html).toContain("3 commits à récupérer");
  });

  it("dit d'où vient la commande d'installation que l'agent n'a pas écrite", () => {
    const html = renderToStaticMarkup(
      <ProjectOverview
        branches={{ status: "idle" }}
        busy={false}
        env={{ status: "idle" }}
        git={{ status: "idle" }}
        onAct={NOOP}
        onCheckGit={NOOP}
        onCheckout={RESOLVED}
        onConfigure={NOOP}
        onReadEnv={NOOP}
        onRegenerateEnv={() => Promise.resolve()}
        onSync={NOOP}
        project={PROJECT}
        switching={false}
        syncing={false}
      />
    );

    expect(html).toContain("dérivée de bun");
    expect(html).toContain("Interrogation du dépôt distant");
  });
});

describe("les adresses d'un projet", () => {
  it("montrent un port sans nom sur la boucle locale, et un port nommé comme un lien", () => {
    const html = renderToStaticMarkup(
      <ProjectAddresses onPublish={NOOP} project={STOPPED} />
    );
    const bare = renderToStaticMarkup(
      <ProjectAddresses
        onPublish={NOOP}
        project={{
          ...STOPPED,
          processes: STOPPED.processes.map((process) => ({
            ...process,
            routes: [],
          })),
        }}
      />
    );

    expect(html).toContain("127.0.0.1:3100");
    expect(html).toContain('data-published="false"');
    expect(html).not.toContain("Ouvrir ");
    expect(bare).toContain('data-addresses="1"');
    expect(bare).toContain("127.0.0.1:3100");
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
    expect(html).toContain("Lecture seule");
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
        onOpen={RESOLVED}
        onShare={RESOLVED}
        root={GIT_STATUS.root}
        share={null}
      />
    );

    expect(html).toContain('<fieldset aria-label="Ouvrir dans un éditeur"');
    expect(html).toContain(">Ouvrir</span>");
    expect(html).toContain('data-logo="editor.jetbrains"');
    expect(html).toContain(
      `data-tooltip="Ouvrir ${GIT_STATUS.root} dans JetBrains Gateway"`
    );
    expect(html).not.toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("VS Code");
    expect(html).not.toContain('data-logo="editor.zed"');
  });

  it("n'affichent rien tant que l'agent n'a pas donné de chemin absolu", () => {
    const html = renderToStaticMarkup(
      <ProjectEditors
        editors={remoteEditors(SNAPSHOT.services)}
        onOpen={RESOLVED}
        onShare={RESOLVED}
        root={null}
        share={null}
      />
    );

    expect(html).toBe("");
  });

  it("demandent d'abord la ligne du fichier du système quand il ne la porte pas", () => {
    const html = renderToStaticMarkup(
      <ProjectEditors
        editors={remoteEditors(SNAPSHOT.services)}
        onOpen={RESOLVED}
        onShare={RESOLVED}
        root={GIT_STATUS.root}
        share="/home/jean/.ssh/config"
      />
    );

    expect(html).toContain(
      `data-tooltip="Ouvrir ${GIT_STATUS.root} dans JetBrains Gateway"`
    );
    expect(html).toContain('aria-haspopup="dialog"');
  });
});
