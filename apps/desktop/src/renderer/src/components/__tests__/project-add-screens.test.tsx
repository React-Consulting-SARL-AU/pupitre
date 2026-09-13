import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PortRow, RowProblem } from "../../lib/project-ports";
import type {
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

const DRAFT: Draft = {
  branch: "main",
  cmd: "bun run dev --port 3000",
  dir: "vite-starter",
  kind: "git",
  name: "vite-starter",
  pkgmgr: "bun",
  privateRepo: false,
  rows: ROWS,
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
  addRow: () => undefined,
  branch: () => undefined,
  browse: () => undefined,
  cmd: () => undefined,
  createFolder: () => Promise.resolve(),
  generateRowWeb: () => undefined,
  kind: () => undefined,
  loadRepos: () => Promise.resolve(),
  name: () => undefined,
  pickFolder: () => undefined,
  pickRepo: () => undefined,
  pkgmgr: () => undefined,
  removeRow: () => undefined,
  rowLabel: () => undefined,
  rowPort: () => undefined,
  rowPublish: () => undefined,
  rowWeb: () => undefined,
  source: () => undefined,
};

const PHASES: Phase[] = [
  { detail: "vite-starter · port 3001", id: "add", status: "ok" },
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
    exposure?: Exposure | null;
    detection?: DetectionState;
    logs?: string[];
    rows?: PortRow[];
    rowProblems?: (RowProblem | null)[];
  } = {}
): string {
  return renderToStaticMarkup(
    <ProjectAddPanel
      detected={false}
      detection={extra.detection ?? { status: "idle" }}
      draft={{ ...DRAFT, rows: extra.rows ?? ROWS }}
      edit={EDIT}
      exposure={extra.exposure ?? null}
      folders={NO_FOLDERS}
      githubModule={false}
      known={READY}
      logs={extra.logs ?? []}
      onCancel={() => undefined}
      onConnect={() => undefined}
      onDetect={() => undefined}
      onFinish={() => undefined}
      onInstallModule={() => undefined}
      onLaunch={() => undefined}
      onReload={() => undefined}
      onRetry={() => undefined}
      phases={PHASES}
      ready
      repos={NO_REPOS}
      rowProblems={extra.rowProblems ?? (extra.rows ?? ROWS).map(() => null)}
      run={run}
      serverName="staging"
    />
  );
}

describe("le formulaire d'un nouveau projet", () => {
  it("demande la source et offre de créer ou de renoncer", () => {
    const rendered = text(panel({ status: "idle" }));

    expect(rendered).toContain("Nouveau projet");
    expect(rendered).toContain("Source");
    expect(rendered).toContain("Créer le projet");
    expect(rendered).toContain("Annuler");
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
    expect(published).toContain('id="project.ports.0.web"');
    expect(published).not.toContain('id="project.ports.1.web"');
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

    expect(refused).toContain('id="project.ports.0.web-problem"');
    expect(refused).toContain(
      'aria-describedby="project.ports.0.web-problem" aria-invalid="true"'
    );
    expect(text(refused)).toContain("les points séparent les niveaux");
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

  it("dit sous la source ce que l'agent y a lu, ou pourquoi il n'a pas pu", () => {
    const read = panel(
      { status: "idle" },
      {
        detection: {
          result: {
            cmd: "pnpm dev --port 5173",
            pkgmgr: "pnpm",
            port_hint: 5173,
          },
          source: DRAFT.source,
          status: "read",
        },
      }
    );
    const reading = panel(
      { status: "idle" },
      { detection: { source: DRAFT.source, status: "reading" } }
    );
    const readingBranch = panel(
      { status: "idle" },
      {
        detection: {
          branch: "release/2.0",
          source: DRAFT.source,
          status: "reading",
        },
      }
    );
    const failed = panel(
      { status: "idle" },
      {
        detection: {
          error: { code: "bad_request", message: "le dépôt ne répond pas" },
          source: DRAFT.source,
          status: "failed",
        },
      }
    );

    expect(text(read)).toContain("Lu dans la source : pnpm, port 5173.");
    expect(text(reading)).toContain(
      "L'agent clone le dépôt et lit ce qu'il demande…"
    );
    expect(reading).toContain('role="status"');
    expect(reading).toContain('data-live="duration"');
    expect(reading).toMatch(/<input aria-busy="true"[^>]*id="project\.branch"/);
    expect(text(readingBranch)).toContain(
      "L'agent clone la branche release/2.0 et lit ce qu'elle demande…"
    );
    expect(text(failed)).toContain("le dépôt ne répond pas");
    expect(failed).toContain('aria-invalid="true"');
    expect(failed).toContain(
      'aria-describedby="project.source-help project.source-problem"'
    );
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
  });
});

describe("un projet en ligne", () => {
  it("dit son adresse et offre de l'ouvrir", () => {
    const rendered = panel({
      name: "vite-starter",
      port: 3000,
      serverId: "srv-1",
      state: "online",
      status: "done",
      url: "http://127.0.0.1:3000",
    });

    expect(text(rendered)).toContain("vite-starter en ligne");
    expect(text(rendered)).toContain("http://127.0.0.1:3000 · port 3000");
    expect(text(rendered)).toContain("Ouvrir le projet");
    expect(rendered).toContain('data-outcome="online"');
  });
});

describe("les phases", () => {
  it("portent leur état par la forme, et ce que l'agent en a dit", () => {
    const html = renderToStaticMarkup(<ProjectAddSteps phases={PHASES} />);

    expect(html).toContain('data-phase="add" data-status="ok"');
    expect(html).toContain('data-shape="filled"');
    expect(html).toContain('data-shape="breathing"');
    expect(html).toContain('data-shape="struck"');
    expect(text(html)).toContain("vite-starter · port 3001");
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
