import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  Draft,
  FirstProjectState,
  KnownState,
  Phase,
} from "../../stores/first-project";
import { FirstProjectJournal } from "../first-project/first-project-journal";
import { FirstProjectPanel } from "../first-project/first-project-panel";
import { FirstProjectSteps } from "../first-project/first-project-steps";

/**
 * What the first-project step shows in each of its states. The panel takes
 * everything it draws as a prop: the store above it is tested on its own.
 */

const DRAFT: Draft = {
  cmd: "bun run dev --port 3000",
  dir: "vite-starter",
  name: "vite-starter",
  pkgmgr: "bun",
  port: 3000,
  source: "https://github.com/moi/vite-starter.git",
  subdomain: "vite-starter",
};

const READY: KnownState = {
  projects: [],
  serverId: "srv-1",
  status: "ready",
};

const EDIT = {
  cmd: () => undefined,
  name: () => undefined,
  pkgmgr: () => undefined,
  port: () => undefined,
  source: () => undefined,
  subdomain: () => undefined,
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
  run: FirstProjectState,
  extra: { cloudflare?: boolean; logs?: string[] } = {}
): string {
  return renderToStaticMarkup(
    <FirstProjectPanel
      cloudflare={extra.cloudflare ?? false}
      detected={false}
      draft={DRAFT}
      edit={EDIT}
      known={READY}
      logs={extra.logs ?? []}
      onLaunch={() => undefined}
      onReload={() => undefined}
      onRetry={() => undefined}
      phases={PHASES}
      ready
      run={run}
      serverName="staging"
    />
  );
}

describe("l'étape que l'on peut sauter", () => {
  it("offre de remettre le premier projet à plus tard", () => {
    const rendered = text(panel({ status: "idle" }));

    expect(rendered).toContain("Plus tard");
    expect(rendered).toContain("Source");
    expect(rendered).toContain("Créer le projet");
  });

  it("ne demande un sous-domaine que si le tunnel est installé", () => {
    expect(text(panel({ status: "idle" }))).not.toContain("Sous-domaine");
    expect(text(panel({ status: "idle" }, { cloudflare: true }))).toContain(
      "Sous-domaine"
    );
  });
});

describe("un projet qui ne démarre pas", () => {
  const run: FirstProjectState = {
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

  it("garde le journal, l'erreur telle quelle et son remède, et propose de réessayer", () => {
    const rendered = text(
      panel(run, { logs: ["error: Cannot find module 'vite'"] })
    );

    expect(rendered).toContain("error: Cannot find module 'vite'");
    expect(rendered).toContain("shop : bun run dev s'est arrêté aussitôt");
    expect(rendered).toContain(
      "Ouvre le journal du projet, ou corrige la colonne install du registre."
    );
    expect(rendered).toContain("Réessayer");
    expect(rendered).toContain("Plus tard");
  });
});

describe("un projet en ligne", () => {
  const run: FirstProjectState = {
    name: "vite-starter",
    port: 3000,
    serverId: "srv-1",
    state: "online",
    status: "done",
    url: "https://vite-starter.exemple.dev",
  };

  it("montre l'adresse que l'agent a donnée et propose de terminer", () => {
    const rendered = text(panel(run));

    expect(rendered).toContain("https://vite-starter.exemple.dev");
    expect(rendered).toContain("port 3000");
    expect(rendered).toContain("Terminer");
    expect(rendered).not.toContain("Plus tard");
  });
});

describe("les phases", () => {
  it("distingue chaque état par sa forme", () => {
    const html = renderToStaticMarkup(<FirstProjectSteps phases={PHASES} />);

    expect(html).toContain('data-shape="filled"');
    expect(html).toContain('data-shape="breathing"');
    expect(html).toContain('data-shape="empty"');
    expect(html).toContain('data-shape="struck"');
  });

  it("dit ce que l'agent fait pendant l'attente", () => {
    const rendered = text(
      renderToStaticMarkup(<FirstProjectSteps phases={PHASES} />)
    );

    expect(rendered).toContain(
      "L'agent installe les dépendances avec le gestionnaire choisi."
    );
    expect(rendered).toContain("vite-starter · port 3001");
  });
});

describe("le journal", () => {
  it("ne s'affiche pas tant qu'aucune ligne n'est arrivée", () => {
    expect(renderToStaticMarkup(<FirstProjectJournal lines={[]} />)).toBe("");
  });

  it("garde les lignes dans l'ordre où elles sont arrivées", () => {
    const rendered = text(
      renderToStaticMarkup(
        <FirstProjectJournal lines={["première", "seconde"]} />
      )
    );

    expect(rendered).toContain("première seconde");
  });
});
