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

describe("a project header", () => {
  it("shows the state, the branch and what is not committed, without the remote gap", () => {
    const html = renderToStaticMarkup(
      <ProjectMeta git={GIT_STATUS} onSeeDiff={NOOP} project={PROJECT} />
    );

    expect(html).toContain('data-state="online"');
    expect(html).toContain("main");
    expect(html).toContain("2 changements");
    expect(html).not.toContain("↓3");
  });

  it("hides the branch of a folder that is not a repository", () => {
    const html = renderToStaticMarkup(
      <ProjectMeta git={null} onSeeDiff={NOOP} project={PROJECT} />
    );

    expect(html).toContain('data-state="online"');
    expect(html).not.toContain("<button");
  });

  it("restarts an online project and syncs it", () => {
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

  it("offers to start a stopped project, not to stop it", () => {
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

describe("a project's tabs", () => {
  it("separate shells from agents, under two tabs", () => {
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

  it("drop the diff of a folder that is not a repository", () => {
    expect(tabsFor({ repo: false })).not.toContain("diff");
  });

  it("route a shell under Terminaux and an agent under Agents", () => {
    expect(tabOfKind("shell")).toBe("terminals");
    expect(tabOfKind("claude")).toBe("agents");
    expect(tabOfKind("codex")).toBe("agents");
  });

  it("carry the number of changed files, of open sessions, and their state", () => {
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

  it("state on each tab the shortcut that leads to it", () => {
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

describe("choosing an agent", () => {
  it("offers a card per agent the machine holds, under its module logo, and launches the one pressed", async () => {
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

  it("says where an agent is installed when the machine holds none", async () => {
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

describe("a project overview", () => {
  it("renders the address, the branches, the processes and the memory", () => {
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

  it("says where the install command the agent did not write comes from", () => {
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

describe("a project's addresses", () => {
  it("show an unnamed port on the loopback, and a named port as a link", () => {
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

  it("only offer to open a web name while its process is running", () => {
    const online = renderToStaticMarkup(
      <ProjectAddresses onPublish={NOOP} project={PROJECT} />
    );
    const halted = renderToStaticMarkup(
      <ProjectAddresses
        onPublish={NOOP}
        project={{
          ...PROJECT,
          processes: PROJECT.processes.map((process) => ({
            ...process,
            state: "stopped" as const,
          })),
          state: "stopped",
        }}
      />
    );

    expect(online).toContain('data-tooltip="Ouvrir flyleaf.example.org"');
    expect(halted).toContain("flyleaf.example.org");
    expect(halted).toContain('data-published="true"');
    expect(halted).not.toContain("Ouvrir ");
  });
});

describe("a project diff", () => {
  it("groups files the way git groups them", () => {
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

  it("marks patch lines by their sign as much as by their background", () => {
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

  it("says so when the folder is not a repository", () => {
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

describe("remote editors", () => {
  it("only offer those whose module is installed", () => {
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

  it("show nothing until the agent has given an absolute path", () => {
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

  it("first ask for the system file line when it does not carry it", () => {
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
