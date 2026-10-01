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

describe("a project's configuration", () => {
  it("shows the project's command, installation, branch and ports, without its source or name", () => {
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
  it("first asks whether the project starts with the server, before the branch", () => {
    const html = panel({ status: "idle" });

    expect(text(html)).toContain("Démarrer le projet avec le serveur");
    expect(html.indexOf('name="config.boot"')).toBeLessThan(
      html.indexOf('id="config.branch"')
    );
  });

  it("folds each process under its summary, and opens the one that would be refused", () => {
    const folded = panel({ status: "idle" });
    const refused = panel({ status: "idle" }, { processProblems: ["cmd"] });

    expect(folded).toMatch(/data-closed=""[^>]*data-process="0"/);
    expect(folded).toMatch(
      /data-process-fold="0"[^>]*>[\s\S]*?3000[\s\S]*?flyleaf\.example\.org[\s\S]*?<\/button>/
    );
    expect(text(folded)).toContain("principal");

    expect(refused).toMatch(/data-open=""[^>]*data-process="0"/);
  });

  it("arranges the configuration in parts, on a column at the left", () => {
    const html = panel({ status: "idle" });
    const bare = panel({ status: "idle" }, { services: [] });

    expect(html).toContain('aria-label="Parties de la configuration"');
    expect(text(html)).toContain("Général");
    expect(text(html)).toContain("Environnements");
    expect(text(html)).toContain("Processus");
    expect(text(html)).toContain("Accès");
    expect(text(bare)).not.toContain("Environnements");
  });

  it("flags a process to fix on its part", () => {
    const html = panel({ status: "idle" }, { processProblems: ["cmd"] });

    expect(html).toContain('data-part-refused="processes"');
    expect(html).toContain("Processus, un champ à corriger");
  });

  it("protects the project, and lets each process follow the project or decide", () => {
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

  it("offers nothing about protection to an agent without a gate", () => {
    const html = panel({ status: "idle" }, { gated: false, part: "access" });

    expect(text(html)).toContain("n'a pas de portier d'accès");
    expect(text(html)).not.toContain("Clés qui ouvrent");
  });

  it("offers a version per installed runtime, the default named, nothing without a runtime", async () => {
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

  it("says a command change restarts its process, and which addresses die", () => {
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

  it("waits on the button, then reads the agent's response under the form", () => {
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

  it("says separately, next to the save, what the exposure refused and each agent reservation", () => {
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
