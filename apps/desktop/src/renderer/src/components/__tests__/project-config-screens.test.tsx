import { describe, expect, it } from "bun:test";
import type {
  ProjectRuntimes,
  Service,
} from "@pupitre/shared/agent-protocol/state";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, optionsOf } from "../../__tests__/dom";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import {
  type ProcessProblem,
  processesFromProject,
} from "../../lib/project-processes";
import type { ConfigState } from "../../stores/project-config";
import {
  type ConfigPart,
  ProjectConfigPanel,
} from "../projects/project-config-panel";

const PROJECT = SNAPSHOT.projects[0];

const EDIT = {
  addProcess: () => undefined,
  addRow: () => undefined,
  boot: () => undefined,
  branch: () => undefined,
  generateRowWeb: () => undefined,
  processCmd: () => undefined,
  processDir: () => undefined,
  processId: () => undefined,
  processInstall: () => undefined,
  processAccess: () => undefined,
  processPkgmgr: () => undefined,
  protected: () => undefined,
  removeProcess: () => undefined,
  removeRow: () => undefined,
  runtime: () => undefined,
  rowLabel: () => undefined,
  rowPort: () => undefined,
  rowPublish: () => undefined,
  rowWeb: () => undefined,
};

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const RUNTIMES: Service[] = [
  {
    configured: true,
    id: "runtime.node",
    name: "Node.js",
    runs: false,
    state: "running",
    version: "node 22.19.0 · 24.8.0",
    versions: ["24", "22"],
  },
  {
    configured: true,
    id: "runtime.java",
    name: "Java (Temurin)",
    runs: false,
    state: "running",
    version: "java temurin-21.0.4",
    versions: ["21"],
  },
];

interface Extra {
  restarts?: string[];
  dropped?: string[];
  services?: Service[];
  runtimes?: ProjectRuntimes;
  processProblems?: (ProcessProblem | null)[];
  part?: ConfigPart;
  guarded?: boolean;
  gated?: boolean;
}

function element(run: ConfigState, extra: Extra = {}) {
  if (!PROJECT) {
    throw new Error("the fixture has no project");
  }

  return (
    <ProjectConfigPanel
      draft={{
        boot: false,
        branch: "main",
        processes: processesFromProject(PROJECT),
        protected: extra.guarded ?? true,
        runtimes: extra.runtimes ?? {},
      }}
      dropped={extra.dropped ?? []}
      edit={EDIT}
      exposure={{ host: "192.0.2.10", provider: "cloudflare" }}
      gated={extra.gated ?? true}
      onSave={() => Promise.resolve()}
      openAt={extra.part}
      processProblems={extra.processProblems ?? [null]}
      project={PROJECT}
      projects={SNAPSHOT.projects}
      ready
      restarts={extra.restarts ?? []}
      rowProblems={[[null, null]]}
      run={run}
      serverId="srv-1"
      services={extra.services ?? [...SNAPSHOT.services, ...RUNTIMES]}
    />
  );
}

function panel(run: ConfigState, extra: Extra = {}): string {
  return renderToStaticMarkup(element(run, extra));
}

describe("la configuration d'un projet", () => {
  it("montre la commande, l'installation, la branche et les ports du projet, sans sa source ni son nom", () => {
    const html = panel({ status: "idle" });

    expect(html).toContain('value="bun run dev --port 3000"');
    expect(html).toContain('id="config.branch"');
    expect(html).toContain('id="project.processes.0.install"');
    expect(html).toContain('id="project.processes.0.id"');
    expect(html).toContain('value="flyleaf.example.org"');
    expect(html).toContain('value="api-flyleaf.example.org"');
    expect(html).not.toContain('id="project.source"');
    expect(html).not.toContain('id="project.name"');
    expect(text(html)).toContain("Enregistrer la configuration");
  });

  // A reader who only came to choose whether the project boots with the server never scrolls.
  it("demande d'abord si le projet démarre avec le serveur, avant la branche", () => {
    const html = panel({ status: "idle" });

    expect(text(html)).toContain("Démarrer le projet avec le serveur");
    expect(html.indexOf('name="config.boot"')).toBeLessThan(
      html.indexOf('id="config.branch"')
    );
  });

  it("replie chaque processus sous son résumé, et ouvre celui qui serait refusé", () => {
    const folded = panel({ status: "idle" });
    const refused = panel({ status: "idle" }, { processProblems: ["cmd"] });

    expect(folded).toMatch(/data-closed=""[^>]*data-process="0"/);
    expect(folded).toMatch(
      /data-process-fold="0"[^>]*>[\s\S]*?3000[\s\S]*?flyleaf\.example\.org[\s\S]*?<\/button>/
    );
    expect(text(folded)).toContain("principal");

    expect(refused).toMatch(/data-open=""[^>]*data-process="0"/);
  });

  it("range la configuration en parties, sur une colonne à gauche", () => {
    const html = panel({ status: "idle" });
    const bare = panel({ status: "idle" }, { services: [] });

    expect(html).toContain('aria-label="Parties de la configuration"');
    expect(text(html)).toContain("Général");
    expect(text(html)).toContain("Environnements");
    expect(text(html)).toContain("Processus");
    expect(text(html)).toContain("Accès");
    expect(text(bare)).not.toContain("Environnements");
  });

  it("signale sur sa partie un processus à corriger", () => {
    const html = panel({ status: "idle" }, { processProblems: ["cmd"] });

    expect(html).toContain('data-part-refused="processes"');
    expect(html).toContain("Processus, un champ à corriger");
  });

  it("protège le projet, et laisse chaque processus suivre le projet ou en décider", () => {
    const html = panel({ status: "idle" }, { part: "access" });
    const open = panel({ status: "idle" }, { guarded: false, part: "access" });

    expect(html).toContain('name="config.protected"');
    expect(text(html)).toContain("Protéger le projet");
    expect(text(html)).toContain("ne s'ouvrent qu'avec une clé d'accès");
    expect(html).toContain('aria-label="Accès de flyleaf-api"');
    expect(text(html)).toContain("Comme le projet : protégé");
    expect(text(html)).toContain("Clés qui ouvrent flyleaf-api");

    expect(text(open)).toContain("Comme le projet : public");
    expect(text(open)).toContain("récepteur de webhooks");
  });

  it("ne propose rien de la protection à un agent sans portier", () => {
    const html = panel({ status: "idle" }, { gated: false, part: "access" });

    expect(text(html)).toContain("n'a pas de portier d'accès");
    expect(text(html)).not.toContain("Clés qui ouvrent");
  });

  it("propose une version par runtime installé, le défaut nommé, rien sans runtime", async () => {
    const html = panel(
      { status: "idle" },
      { part: "runtimes", runtimes: { node: "22" } }
    );
    const none = panel({ status: "idle" }, { part: "runtimes", services: [] });

    expect(none).not.toContain("config.runtimes");

    expect(html).toContain('id="config.runtimes.node"');
    expect(html).toContain('id="config.runtimes.java"');
    expect(html).not.toContain('id="config.runtimes.db.postgres"');
    expect(text(html)).toContain("Par défaut (21)");
    expect(html).toContain('name="config.runtimes.node" value="22"');

    const view = await mount(
      element(
        { status: "idle" },
        { part: "runtimes", runtimes: { node: "22" } }
      )
    );
    const node = await optionsOf(
      view,
      document.getElementById("config.runtimes.node")
    );

    expect(node.options).toEqual(["Par défaut (24)", "24", "22"]);

    view.unmount();
  });

  it("dit qu'un changement de commande redémarre son processus, et quelles adresses meurent", () => {
    const html = text(
      panel(
        { status: "idle" },
        { dropped: ["api-flyleaf.example.org"], restarts: ["flyleaf-api"] }
      )
    );

    expect(html).toContain("redémarre flyleaf-api");
    expect(html).toContain("api-flyleaf.example.org");
    expect(html).toContain("cessent de répondre");
  });

  it("attend sur le bouton, puis lit la réponse de l'agent sous le formulaire", () => {
    if (!PROJECT) {
      throw new Error("the fixture has no project");
    }

    const saving = panel({ name: "flyleaf-api", status: "saving" });
    const saved = text(
      panel({ name: "flyleaf-api", project: PROJECT, status: "saved" })
    );
    const failed = text(
      panel({
        error: {
          code: "bad_request",
          fix: "Give a name under example.org.",
          message: "shop.elsewhere.org is not under this server's domain",
        },
        name: "flyleaf-api",
        status: "failed",
      })
    );

    expect(saving).toContain('aria-busy="true"');
    expect(saved).toContain("flyleaf-api est réécrit dans le registre");
    expect(failed).toContain(
      "shop.elsewhere.org is not under this server's domain"
    );
    expect(failed).toContain("Give a name under example.org.");
  });

  it("dit à part, à côté de l'enregistrement, ce que l'exposition a refusé et chaque réserve de l'agent", () => {
    if (!PROJECT) {
      throw new Error("the fixture has no project");
    }

    const html = panel({
      name: "flyleaf-api",
      project: PROJECT,
      status: "saved",
      sync: {
        code: "internal",
        fix: "Reconnecte le compte Cloudflare.",
        message: "le tunnel refuse",
      },
      warnings: ["le démarrage a refusé, le processus reste arrêté"],
    });

    expect(text(html)).toContain("flyleaf-api est réécrit dans le registre");
    expect(text(html)).toContain("le tunnel refuse");
    expect(text(html)).toContain("Reconnecte le compte Cloudflare.");
    expect(text(html)).toContain(
      "le démarrage a refusé, le processus reste arrêté"
    );
    expect(html).toContain('data-callout="config-warning"');
  });
});
