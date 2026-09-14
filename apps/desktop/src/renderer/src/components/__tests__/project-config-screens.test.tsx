import { describe, expect, it } from "bun:test";
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
  branch: () => undefined,
  generateRowWeb: () => undefined,
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
};

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function panel(
  run: ConfigState,
  extra: { restarts?: string[]; dropped?: string[] } = {}
): string {
  if (!PROJECT) {
    throw new Error("the fixture has no project");
  }

  return renderToStaticMarkup(
    <ProjectConfigPanel
      draft={{
        branch: "main",
        processes: processesFromProject(PROJECT),
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
});
