import { describe, expect, it } from "bun:test";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import { renderToStaticMarkup } from "react-dom/server";
import type { PortRow, RowProblem } from "../../lib/project-ports";
import type { ProcessDraft, ProcessProblem } from "../../lib/project-processes";
import type {
  AddStep,
  DetectionState,
  Draft,
  Exposure,
  FolderState,
  KnownState,
  Phase,
  ProjectAddState,
  ReposState,
} from "../../stores/project-add";
import { ProjectAddJournal } from "../projects/project-add-journal";
import { ProjectAddPanel } from "../projects/project-add-panel";
import { ProjectAddRepos } from "../projects/project-add-repos";
import { ProjectAddSteps } from "../projects/project-add-steps";

const ROWS: PortRow[] = [
  {
    key: "row-1",
    label: "web",
    ownWeb: false,
    port: 3000,
    publish: true,
    web: "vite-starter",
    whole: false,
  },
  {
    key: "row-2",
    label: "api",
    ownWeb: false,
    port: 3001,
    publish: false,
    web: "api-vite-starter",
    whole: false,
  },
];

const PROCESS: ProcessDraft = {
  access: "project",
  cmd: "bun run dev --port 3000",
  dir: "",
  host: "127.0.0.1",
  id: "app",
  install: "",
  key: "process-1",
  ownCmd: false,
  pkgmgr: "bun",
  proposed: {},
  rows: ROWS,
};

const DRAFT: Draft = {
  boot: false,
  branch: "main",
  startNow: true,
  dir: "vite-starter",
  kind: "git",
  name: "vite-starter",
  privateRepo: false,
  processes: [PROCESS],
  source: "https://github.com/moi/vite-starter.git",
};

const TUNNEL: Exposure = { host: "192.0.2.10", provider: "cloudflare" };

const CADDY: Exposure = { host: "192.0.2.10", provider: "caddy" };

const NO_REPOS: ReposState = { status: "absent" };

const NO_FOLDERS: FolderState = { folders: [], path: "", status: "ready" };

const READY: KnownState = {
  projects: [],
  serverId: "srv-1",
  status: "ready",
};

const EDIT = {
  addProcess: () => undefined,
  addRow: () => undefined,
  boot: () => undefined,
  branch: () => undefined,
  browse: () => undefined,
  createFolder: () => Promise.resolve(null),
  generateRowWeb: () => undefined,
  kind: () => undefined,
  loadRepos: () => Promise.resolve(),
  name: () => undefined,
  pickFolder: () => undefined,
  pickRepo: () => undefined,
  processCmd: () => undefined,
  processDir: () => undefined,
  processId: () => undefined,
  processInstall: () => undefined,
  processPkgmgr: () => undefined,
  removeProcess: () => undefined,
  removeRow: () => undefined,
  rowLabel: () => undefined,
  rowPort: () => undefined,
  rowPublish: () => undefined,
  rowWeb: () => undefined,
  source: () => undefined,
  startNow: () => undefined,
};

const PHASES: Phase[] = [
  { detail: "vite-starter · app:3001", id: "add", status: "ok" },
  {
    detail: "le dossier est déjà sur le serveur",
    id: "sources",
    status: "skip",
  },
  { id: "install", status: "running" },
  { id: "up", status: "pending" },
  { id: "publish", status: "pending" },
  { id: "logs", status: "fail" },
];

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function panel(
  run: ProjectAddState,
  extra: {
    step?: AddStep;
    draft?: Partial<Draft>;
    exposure?: Exposure | null;
    detection?: DetectionState;
    declared?: Project | null;
    logs?: string[];
    rows?: PortRow[];
    processes?: ProcessDraft[];
    processProblems?: (ProcessProblem | null)[];
    rowProblems?: (RowProblem | null)[];
  } = {}
): string {
  const processes = extra.processes ?? [
    { ...PROCESS, rows: extra.rows ?? ROWS },
  ];

  return renderToStaticMarkup(
    <ProjectAddPanel
      declared={extra.declared ?? null}
      detection={extra.detection ?? { status: "idle" }}
      draft={{ ...DRAFT, ...extra.draft, processes }}
      edit={EDIT}
      exposure={extra.exposure ?? null}
      folders={NO_FOLDERS}
      githubModule={false}
      known={READY}
      logs={extra.logs ?? []}
      onCancel={() => undefined}
      onConnect={() => undefined}
      onDetect={() => undefined}
      onEditSource={() => undefined}
      onFinish={() => undefined}
      onInstallModule={() => undefined}
      onLaunch={() => undefined}
      onOpenDeclared={() => undefined}
      onReload={() => undefined}
      onRetry={() => undefined}
      onSkipReading={() => undefined}
      phases={PHASES}
      processProblems={extra.processProblems ?? processes.map(() => null)}
      ready
      repos={NO_REPOS}
      rowProblems={processes.map((process, index) =>
        index === 0 && extra.rowProblems
          ? extra.rowProblems
          : process.rows.map(() => null)
      )}
      run={run}
      step={extra.step ?? "config"}
    />
  );
}

describe("the new project form", () => {
  it("opens on the source alone, and ends on reading it", () => {
    const rendered = panel({ status: "idle" }, { step: "source" });

    expect(text(rendered)).toContain("Ajouter un projet");
    expect(rendered).toContain('data-step="source"');
    expect(text(rendered)).toContain("Adresse git");
    expect(rendered).toContain('id="project.source"');
    expect(text(rendered)).toContain("Lire le dépôt");
    expect(text(rendered)).toContain("Annuler");
    expect(text(rendered)).not.toContain("Créer le projet");
    expect(rendered).not.toContain('id="project.name"');
    expect(rendered).not.toContain("data-ports=");

    expect(
      text(
        panel({ status: "idle" }, { draft: { kind: "dir" }, step: "source" })
      )
    ).toContain("Lire le dossier");
  });

  it("reads nothing without a source, nor a project the server already declares", () => {
    const empty = panel(
      { status: "idle" },
      { draft: { source: "" }, step: "source" }
    );
    const declared = panel(
      { status: "idle" },
      {
        declared: {
          boot: false,
          dir: "vite-starter",
          name: "vite-starter",
          path: "/home/dev/projects/vite-starter",
          processes: [],
          state: "stopped",
        },
        step: "source",
      }
    );

    expect(empty).toMatch(
      /<button[^>]*disabled[^>]*>[^<]*<svg[^>]*>.*?Lire le dépôt/
    );
    expect(declared).toMatch(
      /<button[^>]*disabled[^>]*>[^<]*<svg[^>]*>.*?Lire le dépôt/
    );
    expect(text(declared)).toContain("déclare déjà ce projet");
    expect(text(declared)).toContain("Ouvrir le projet");
  });

  it("keeps the source in view on the configuration, and offers to go back to it", () => {
    const rendered = panel({ status: "idle" });
    const own = text(panel({ status: "idle" }, { draft: { branch: "" } }));
    const folder = text(
      panel({ status: "idle" }, { draft: { kind: "dir", source: "apps/api" } })
    );

    expect(rendered).toContain('data-step="config"');
    expect(rendered).toContain('data-source="repo"');
    expect(text(rendered)).toContain(
      "Dépôt https://github.com/moi/vite-starter.git"
    );
    expect(text(rendered)).toContain("Branche main");
    expect(text(rendered)).toContain("Modifier la source");
    expect(text(rendered)).toContain("Créer le projet");
    expect(text(rendered)).not.toContain("Lire le dépôt");
    expect(rendered).not.toContain('id="project.source"');

    expect(own).toContain("Branche celle du dépôt");

    expect(folder).toContain("Dossier apps/api");
    expect(folder).not.toContain("Branche");
  });

  it("lists the ports in rows, and only asks for a web name if an exposure is installed and the reader publishes", () => {
    const local = panel({ status: "idle" });
    const published = panel({ status: "idle" }, { exposure: TUNNEL });

    expect(text(local)).toContain("Ports");
    expect(local).toContain('data-ports="2"');
    expect(local).not.toContain('aria-label="Publier"');
    expect(text(local)).not.toContain("Sur le web");

    expect(text(published)).toContain("Sur le web");
    expect(published).toContain('aria-label="Publier"');
    expect(published).toContain('id="project.processes.0.ports.0.web"');
    expect(published).not.toContain('id="project.processes.0.ports.1.web"');
    expect(text(published)).toContain("Non publié");
    expect(text(published)).toContain("Ajouter un port");
    expect(published).toContain('aria-label="Retirer le port api"');
    expect(published).not.toContain('aria-label="Retirer le port web"');
  });

  it("says under the row why a name would be refused, and binds it to the field", () => {
    const refused = panel(
      { status: "idle" },
      { exposure: TUNNEL, rowProblems: ["web", null] }
    );

    expect(refused).toContain('id="project.processes.0.ports.0.web-problem"');
    expect(refused).toContain(
      'aria-describedby="project.processes.0.ports.0.web-problem" aria-invalid="true"'
    );
    expect(text(refused)).toContain("les points séparent les niveaux");
  });

  it("says under the project name why it is refused, and binds it to the field", () => {
    const refused = panel({ status: "idle" }, { draft: { name: "Mon Site" } });

    expect(refused).toContain('id="project.name-problem"');
    expect(refused).toContain('aria-invalid="true"');
    expect(text(refused)).toContain(
      "Minuscules, chiffres, points, tirets et soulignés, en commençant par une lettre ou un chiffre."
    );
    expect(panel({ status: "idle" })).not.toContain("project.name-problem");
    expect(panel({ status: "idle" }, { draft: { name: "" } })).not.toContain(
      "project.name-problem"
    );
  });

  it("says, behind Caddy, the address to write in the DNS", () => {
    const caddy = text(panel({ status: "idle" }, { exposure: CADDY }));

    expect(caddy).toContain("192.0.2.10");
    expect(caddy).toContain("enregistrement A");
    expect(text(panel({ status: "idle" }, { exposure: TUNNEL }))).not.toContain(
      "192.0.2.10"
    );
  });

  it("shows in full the address a server already keeps for a port", () => {
    const stored = panel(
      { status: "idle" },
      {
        exposure: TUNNEL,
        rows: [
          {
            ...(ROWS[0] as PortRow),
            ownWeb: true,
            web: "shop.example.org",
            whole: true,
          },
        ],
      }
    );

    expect(stored).toContain('value="shop.example.org"');
  });

  it("holds one process per card, each with its folder, its command and its ports, and only removes one if another remains", () => {
    const one = panel({ status: "idle" });
    const two = panel(
      { status: "idle" },
      {
        exposure: TUNNEL,
        processes: [
          { ...PROCESS, id: "server", pkgmgr: "gradle" },
          {
            ...PROCESS,
            dir: "client",
            id: "client",
            key: "process-2",
            pkgmgr: "pnpm",
            rows: [{ ...(ROWS[1] as PortRow), port: 3001 }],
          },
        ],
        processProblems: [null, "idTaken"],
      }
    );

    expect(text(one)).toContain("Processus");
    expect(one).toContain('data-processes="1"');
    expect(one).not.toContain('aria-label="Retirer le processus app"');
    expect(text(one)).toContain("Ajouter un processus");

    expect(two).toContain('data-processes="2"');
    expect(two).toMatch(/data-open=""[^>]*data-process="0"/);
    expect(two).toMatch(/data-open=""[^>]*data-process="1"/);
    expect(two).toContain('id="project.processes.0.id"');
    expect(two).toContain('id="project.processes.1.dir"');
    expect(two).toContain('value="client"');
    expect(two).toContain('id="project.processes.1.ports.0.port"');
    expect(two).toContain('aria-label="Retirer le processus server"');
    expect(two).toContain('aria-label="Retirer le processus client"');
    expect(two).toContain('id="project.processes.1.id-problem"');
    expect(text(two)).toContain(
      "Un autre processus de ce projet porte cet identifiant."
    );
  });

  it("says under the source what the agent read there, or why it could not", () => {
    const read = panel(
      { status: "idle" },
      {
        detection: {
          result: {
            processes: [
              {
                cmd: "pnpm dev --port 5173",
                dir: ".",
                id: "app",
                pkgmgr: "pnpm",
                port_hint: 5173,
              },
            ],
          },
          source: DRAFT.source,
          status: "read",
        },
      }
    );
    const several = panel(
      { status: "idle" },
      {
        detection: {
          result: {
            processes: [
              { dir: ".", id: "server", pkgmgr: "gradle" },
              { dir: "client", id: "client", pkgmgr: "pnpm" },
            ],
          },
          source: DRAFT.source,
          status: "read",
        },
      }
    );
    const reading = panel(
      { status: "idle" },
      { detection: { source: DRAFT.source, status: "reading" }, step: "source" }
    );
    const readingBranch = panel(
      { status: "idle" },
      {
        detection: {
          branch: "release/2.0",
          source: DRAFT.source,
          status: "reading",
        },
        step: "source",
      }
    );
    const failed = panel(
      { status: "idle" },
      {
        detection: {
          error: {
            code: "bad_request",
            fix: "Vérifiez l'adresse, ou la branche.",
            message: "le dépôt ne répond pas",
          },
          source: DRAFT.source,
          status: "failed",
        },
        step: "source",
      }
    );

    expect(text(read)).toContain("Lu dans la source : pnpm, port 5173.");
    expect(text(several)).toContain("Lu dans la source : server, client.");
    expect(text(reading)).toContain(
      "L'agent clone le dépôt et lit ce qu'il demande…"
    );
    expect(reading).toContain('role="status"');
    expect(reading).toContain('data-live="duration"');
    expect(reading).toMatch(/<input aria-busy="true"[^>]*id="project\.branch"/);
    expect(reading).toMatch(
      /<button aria-busy="true"[^>]*disabled[^>]*>.*?Lire le dépôt/
    );
    expect(text(readingBranch)).toContain(
      "L'agent clone la branche release/2.0 et lit ce qu'elle demande…"
    );
    expect(failed).toContain('data-callout="detection"');
    expect(text(failed)).toContain("le dépôt ne répond pas");
    expect(text(failed)).toContain("Vérifiez l'adresse, ou la branche.");
    expect(text(failed)).toContain("Configurer sans lire");
    expect(text(reading)).not.toContain("Configurer sans lire");
  });
});

describe("a project that does not start", () => {
  const run: ProjectAddState = {
    error: {
      code: "internal",
      fix: "Ouvre le journal du projet, ou corrige la colonne install du registre.",
      message: "shop : bun run dev s'est arrêté aussitôt",
    },
    name: "shop",
    phase: "up",
    serverId: "srv-1",
    status: "failed",
  };

  it("keeps the agent's error and its fix, and offers to resume", () => {
    const rendered = text(panel(run, { logs: ["exit status 1"] }));

    expect(rendered).toContain("shop : bun run dev s'est arrêté aussitôt");
    expect(rendered).toContain("corrige la colonne install");
    expect(rendered).toContain("Réessayer");
    expect(rendered).toContain("exit status 1");
    expect(rendered).not.toContain("Modifier le formulaire");
  });

  // Nothing exists on the server yet: Cancel would drop a draft the reader only has to fix.
  it("offers to go back to the form when the declaration is refused", () => {
    const rendered = text(
      panel({
        ...run,
        error: {
          code: "bad_request",
          fix: "Videz ce dossier ou choisissez-en un autre.",
          message:
            "shop : le dossier /home/dev/projects/shop existe déjà et n'est pas vide",
        },
        phase: "add",
      })
    );

    expect(rendered).toContain("Modifier le formulaire");
    expect(rendered).toContain("Réessayer");
  });

  // Failed sources leave a declared project behind, so the way back names it.
  it("offers to go back to the form when the sources could not arrive", () => {
    const rendered = text(
      panel({
        ...run,
        error: {
          code: "internal",
          fix: "Vérifiez la branche.",
          message: "shop : la branche v2 n'existe pas",
        },
        phase: "sources",
      })
    );

    expect(rendered).toContain("Modifier le formulaire");
    expect(rendered).toContain("Réessayer");
  });
});

describe("a project the server already declares", () => {
  it("names it and offers to open it rather than create it", () => {
    const declared = {
      boot: false,
      dir: "shop",
      name: "shop",
      path: "/home/dev/projects/shop",
      processes: [],
      state: "stopped",
    } as unknown as Project;
    const rendered = text(panel({ status: "idle" }, { declared }));

    expect(rendered).toContain("déclare déjà ce projet sous le nom shop");
    expect(rendered).toContain("Ouvrir le projet");
  });
});

describe("an online project", () => {
  it("says its address and offers to open it", () => {
    const rendered = panel({
      name: "vite-starter",
      serverId: "srv-1",
      state: "online",
      status: "done",
      url: "http://127.0.0.1:3000",
    });

    expect(text(rendered)).toContain("vite-starter en ligne");
    expect(text(rendered)).toContain("http://127.0.0.1:3000");
    expect(text(rendered)).toContain("Ouvrir le projet");
    expect(rendered).not.toContain(">Ouvrir<");
    expect(rendered).toContain('data-outcome="online"');
  });

  it("only offers to open a public address", () => {
    const rendered = panel({
      name: "vite-starter",
      serverId: "srv-1",
      state: "online",
      status: "done",
      url: "https://vite-starter.example.org",
    });

    expect(rendered).toContain(">Ouvrir<");
  });
});

describe("the phases", () => {
  it("state each agent reservation under the phase, without treating it as a failure", () => {
    const html = renderToStaticMarkup(
      <ProjectAddSteps
        phases={[
          {
            detail: "shop · app:3000",
            id: "add",
            status: "ok",
            warnings: ["le dossier n'a pas pu être créé", "node 22 absent"],
          },
        ]}
      />
    );

    expect(html).toContain('data-phase="add" data-status="ok"');
    expect(text(html)).toContain("le dossier n'a pas pu être créé");
    expect(text(html)).toContain("node 22 absent");
    expect(html).toContain('data-warning=""');
  });

  it("carry their state by shape, and what the agent said about it", () => {
    const html = renderToStaticMarkup(<ProjectAddSteps phases={PHASES} />);

    expect(html).toContain('data-phase="add" data-status="ok"');
    expect(html).toContain('data-shape="filled"');
    expect(html).toContain('data-shape="breathing"');
    expect(html).toContain('data-shape="struck"');
    expect(text(html)).toContain("vite-starter · app:3001");
    expect(text(html)).toContain("Nom sur le web");
  });
});

describe("the journal", () => {
  it("only appears with a line to show", () => {
    expect(renderToStaticMarkup(<ProjectAddJournal lines={[]} />)).toBe("");
    expect(
      text(renderToStaticMarkup(<ProjectAddJournal lines={["a", "b"]} />))
    ).toContain("2 lignes");
  });
});

describe("the GitHub account repositories", () => {
  const REPOS: ReposState = {
    repos: [
      {
        cloneUrl: "https://github.com/ada/atlas-web.git",
        defaultBranch: "main",
        fullName: "ada/atlas-web",
        name: "atlas-web",
        owner: "ada",
        private: true,
        pushedAt: "2026-08-20T10:00:00Z",
      },
      {
        cloneUrl: "https://github.com/ada/my.site.git",
        defaultBranch: "release/2.0",
        fullName: "ada/my.site",
        name: "my.site",
        owner: "ada",
        private: false,
        pushedAt: "",
      },
    ],
    status: "ready",
  };

  function repos(picked: string): string {
    return renderToStaticMarkup(
      <ProjectAddRepos
        onConnect={() => undefined}
        onPick={() => undefined}
        onRefresh={() => undefined}
        picked={picked}
        state={REPOS}
      />
    );
  }

  it("offers a search and keeps the list folded until the reader looks at it", () => {
    const html = repos("");

    expect(html).toContain('id="project.repoFilter"');
    expect(html).toContain("Chercher parmi 2 dépôts");
    expect(html).not.toContain("data-repos=");
    expect(text(html)).not.toContain("ada/atlas-web");
  });

  it("shows only the chosen repository, and the way to change it", () => {
    const html = repos("https://github.com/ada/atlas-web.git");

    expect(html).toContain('data-repo="ada/atlas-web"');
    expect(text(html)).toContain("ada/atlas-web");
    expect(text(html)).toContain("main");
    expect(html).toContain('aria-label="Dépôt privé"');
    expect(text(html)).toContain("Changer de dépôt");
    expect(html).not.toContain('id="project.repoFilter"');
    expect(text(html)).not.toContain("ada/my.site");
  });

  it("leads to the settings when no account is connected", () => {
    const html = renderToStaticMarkup(
      <ProjectAddRepos
        onConnect={() => undefined}
        onPick={() => undefined}
        onRefresh={() => undefined}
        picked=""
        state={{ status: "absent" }}
      />
    );

    expect(text(html)).toContain("Aucun compte GitHub n'est connecté.");
    expect(text(html)).toContain("Ouvrir les réglages");
  });
});
