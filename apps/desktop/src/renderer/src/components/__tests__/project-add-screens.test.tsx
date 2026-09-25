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

/**
 * What the new-project screen shows in each of its states. The panel takes
 * everything it draws as a prop: the store above it is tested on its own.
 */

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

describe("le formulaire d'un nouveau projet", () => {
  it("ouvre sur la source seule, et finit sur sa lecture", () => {
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

  it("ne lit rien sans source, ni un projet que le serveur déclare déjà", () => {
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

  it("garde la source en vue sur la configuration, et offre d'y revenir", () => {
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

  it("liste les ports en lignes, et ne demande un nom sur le web que si une exposition est installée et que l'on publie", () => {
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

  it("dit sous la ligne pourquoi un nom serait refusé, et le lie au champ", () => {
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

  it("dit sous le nom du projet pourquoi il est refusé, et le lie au champ", () => {
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

  it("dit, derrière Caddy, l'adresse à écrire dans le DNS", () => {
    const caddy = text(panel({ status: "idle" }, { exposure: CADDY }));

    expect(caddy).toContain("192.0.2.10");
    expect(caddy).toContain("enregistrement A");
    expect(text(panel({ status: "idle" }, { exposure: TUNNEL }))).not.toContain(
      "192.0.2.10"
    );
  });

  it("montre entière l'adresse qu'un serveur garde déjà pour un port", () => {
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

  it("tient un processus par carte, chacun avec son dossier, sa commande et ses ports, et ne retire que s'il en reste un", () => {
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

  it("dit sous la source ce que l'agent y a lu, ou pourquoi il n'a pas pu", () => {
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

describe("un projet qui ne démarre pas", () => {
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

  it("garde l'erreur de l'agent et son remède, et offre de reprendre", () => {
    const rendered = text(panel(run, { logs: ["exit status 1"] }));

    expect(rendered).toContain("shop : bun run dev s'est arrêté aussitôt");
    expect(rendered).toContain("corrige la colonne install");
    expect(rendered).toContain("Réessayer");
    expect(rendered).toContain("exit status 1");
    expect(rendered).not.toContain("Modifier le formulaire");
  });

  /**
   * A declaration refused — a folder already busy, a name taken — is fixed in
   * the form, and nothing exists on the server yet: the form must be reachable
   * with the draft intact, where Cancel would drop it.
   */
  it("offre de revenir au formulaire quand la déclaration est refusée", () => {
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

  /**
   * Sources that would not come — a wrong branch, a private repository — left
   * a declared project behind: the form is reachable too, and names it.
   */
  it("offre de revenir au formulaire quand les sources n'ont pas pu venir", () => {
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

describe("un projet que le serveur déclare déjà", () => {
  it("le nomme et offre de l'ouvrir plutôt que de le créer", () => {
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

describe("un projet en ligne", () => {
  it("dit son adresse et offre de l'ouvrir", () => {
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

  /** The machine's own address is shown for what it is; only a name on the web opens from this computer. */
  it("n'offre d'ouvrir qu'une adresse publique", () => {
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

describe("les phases", () => {
  it("disent chaque réserve de l'agent sous la phase, sans la tenir pour un échec", () => {
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

  it("portent leur état par la forme, et ce que l'agent en a dit", () => {
    const html = renderToStaticMarkup(<ProjectAddSteps phases={PHASES} />);

    expect(html).toContain('data-phase="add" data-status="ok"');
    expect(html).toContain('data-shape="filled"');
    expect(html).toContain('data-shape="breathing"');
    expect(html).toContain('data-shape="struck"');
    expect(text(html)).toContain("vite-starter · app:3001");
    expect(text(html)).toContain("Nom sur le web");
  });
});

describe("le journal", () => {
  it("n'apparaît qu'avec une ligne à montrer", () => {
    expect(renderToStaticMarkup(<ProjectAddJournal lines={[]} />)).toBe("");
    expect(
      text(renderToStaticMarkup(<ProjectAddJournal lines={["a", "b"]} />))
    ).toContain("2 lignes");
  });
});

describe("les dépôts du compte GitHub", () => {
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

  it("offre une recherche et garde la liste repliée tant qu'on n'y regarde pas", () => {
    const html = repos("");

    expect(html).toContain('id="project.repoFilter"');
    expect(html).toContain("Chercher parmi 2 dépôts");
    expect(html).not.toContain("data-repos=");
    expect(text(html)).not.toContain("ada/atlas-web");
  });

  it("ne montre que le dépôt choisi, et la voie pour en changer", () => {
    const html = repos("https://github.com/ada/atlas-web.git");

    expect(html).toContain('data-repo="ada/atlas-web"');
    expect(text(html)).toContain("ada/atlas-web");
    expect(text(html)).toContain("main");
    expect(html).toContain('aria-label="Dépôt privé"');
    expect(text(html)).toContain("Changer de dépôt");
    expect(html).not.toContain('id="project.repoFilter"');
    expect(text(html)).not.toContain("ada/my.site");
  });

  it("mène aux réglages quand aucun compte n'est connecté", () => {
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
