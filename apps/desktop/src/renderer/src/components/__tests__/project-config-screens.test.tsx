import { describe, expect, it } from "bun:test";
import type {
  ProjectRuntimes,
  Service,
} from "@pupitre/shared/agent-protocol/state";
import { renderToStaticMarkup } from "react-dom/server";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { processesFromProject } from "../../lib/project-processes";
import type { ConfigState } from "../../stores/project-config";
import { ProjectConfigPanel } from "../projects/project-config-panel";

/**
 * What the configuration tab shows: the same form as the add, minus the source
 * and the name, and what the save will do said before the button.
 */

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
  processPkgmgr: () => undefined,
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

function panel(
  run: ConfigState,
  extra: {
    restarts?: string[];
    dropped?: string[];
    services?: Service[];
    runtimes?: ProjectRuntimes;
  } = {}
): string {
  if (!PROJECT) {
    throw new Error("the fixture has no project");
  }

  return renderToStaticMarkup(
    <ProjectConfigPanel
      draft={{
        boot: false,
        branch: "main",
        processes: processesFromProject(PROJECT),
        runtimes: extra.runtimes ?? {},
      }}
      dropped={extra.dropped ?? []}
      edit={EDIT}
      exposure={{ host: "192.0.2.10", provider: "cloudflare" }}
      onSave={() => Promise.resolve()}
      processProblems={[null]}
      project={PROJECT}
      ready
      restarts={extra.restarts ?? []}
      rowProblems={[[null, null]]}
      run={run}
      services={extra.services ?? [...SNAPSHOT.services, ...RUNTIMES]}
    />
  );
}

describe("la configuration d'un projet", () => {
  it("montre la commande, l'installation, la branche et les ports du projet, sans sa source ni son nom", () => {
    const html = panel({ status: "idle" });

    expect(html).toContain('value="bun run dev --port 3000"');
    expect(html).toContain('id="config.branch"');
    expect(html).toContain('id="project.processes.0.install"');
    expect(html).toContain('id="project.processes.0.id"');
    expect(html).toContain('value="flymate.example.org"');
    expect(html).toContain('value="api-flymate.example.org"');
    expect(html).not.toContain('id="project.source"');
    expect(html).not.toContain('id="project.name"');
    expect(text(html)).toContain("Enregistrer la configuration");
  });

  /** Each runtime the server holds at several majors gets a select: the default first, named, then the majors; a server without a runtime shows nothing of it. */
  it("propose une version par runtime installé, le défaut nommé, rien sans runtime", () => {
    const html = panel({ status: "idle" }, { runtimes: { node: "22" } });
    const none = panel({ status: "idle" }, { services: [] });

    expect(none).not.toContain("config.runtimes");

    expect(html).toContain('id="config.runtimes.node"');
    expect(html).toContain('id="config.runtimes.java"');
    expect(html).not.toContain('id="config.runtimes.db.postgres"');
    expect(text(html)).toContain("Par défaut (24)");
    expect(text(html)).toContain("Par défaut (21)");
    expect(html).toContain('<option value="22" selected="">');
    expect(html).toContain('value="24"');
  });

  it("dit qu'un changement de commande redémarre son processus, et quelles adresses meurent", () => {
    const html = text(
      panel(
        { status: "idle" },
        { dropped: ["api-flymate.example.org"], restarts: ["flymate-api"] }
      )
    );

    expect(html).toContain("redémarre flymate-api");
    expect(html).toContain("api-flymate.example.org");
    expect(html).toContain("cessent de répondre");
  });

  it("attend sur le bouton, puis lit la réponse de l'agent sous le formulaire", () => {
    if (!PROJECT) {
      throw new Error("the fixture has no project");
    }

    const saving = panel({ name: "flymate-api", status: "saving" });
    const saved = text(
      panel({ name: "flymate-api", project: PROJECT, status: "saved" })
    );
    const failed = text(
      panel({
        error: {
          code: "bad_request",
          fix: "Give a name under example.org.",
          message: "shop.elsewhere.org is not under this server's domain",
        },
        name: "flymate-api",
        status: "failed",
      })
    );

    expect(saving).toContain('aria-busy="true"');
    expect(saved).toContain("flymate-api est réécrit dans le registre");
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
      name: "flymate-api",
      project: PROJECT,
      status: "saved",
      sync: {
        code: "internal",
        fix: "Reconnecte le compte Cloudflare.",
        message: "le tunnel refuse",
      },
      warnings: ["le démarrage a refusé, le processus reste arrêté"],
    });

    expect(text(html)).toContain("flymate-api est réécrit dans le registre");
    expect(text(html)).toContain("le tunnel refuse");
    expect(text(html)).toContain("Reconnecte le compte Cloudflare.");
    expect(text(html)).toContain(
      "le démarrage a refusé, le processus reste arrêté"
    );
    expect(html).toContain('data-callout="config-warning"');
  });
});
