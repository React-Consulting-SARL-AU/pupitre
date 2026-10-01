import { describe, expect, it } from "bun:test";
import type { ConfigRevision } from "@pupitre/shared/agent-protocol/migrate";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModuleProgress } from "../../lib/module-progress";
import type {
  MigrationState,
  ModulesState,
  UpdateState,
  UpgradeState,
} from "../../stores/agent-update";
import { AgentUpdateBanner } from "../updates/agent-update-banner";
import { ModuleUpgradePanel } from "../updates/module-upgrade-panel";

const NOOP = () => undefined;

const OFFER = {
  arch: "amd64",
  notes: ["Retour arrière si la nouvelle version ne répond pas."],
  signed: true,
  source: "app" as const,
  version: "0.4.0",
};

function ready(
  order: "ahead" | "behind" | "same" | "unknown",
  offer = OFFER,
  platform = true,
  config: ConfigRevision | null = null
): UpdateState {
  return {
    serverId: "srv-1",
    status: "ready",
    update: {
      config,
      floor: "0.1.0",
      installed: "0.3.0",
      offer,
      order,
      platform,
      verdict: "ok",
    },
  };
}

function banner(
  state: UpdateState,
  upgrade: UpgradeState = { status: "idle" },
  journal: string[] = [],
  migration: MigrationState = { status: "idle" }
): string {
  return renderToStaticMarkup(
    <AgentUpdateBanner
      journal={journal}
      migration={migration}
      onHide={NOOP}
      onMigrate={NOOP}
      onRepair={NOOP}
      onUpgrade={NOOP}
      state={state}
      upgrade={upgrade}
    />
  );
}

describe("the update banner", () => {
  it("offers the update and carries the version's notes", () => {
    const html = banner(ready("ahead"));

    expect(html).toContain("Mise à jour disponible");
    expect(html).toContain("0.3.0 → 0.4.0");
    expect(html).toContain(
      "Retour arrière si la nouvelle version ne répond pas."
    );
    expect(html).toContain("Mettre l&#x27;agent à jour");
  });

  it("says to update the app without blocking anything when it is behind", () => {
    const html = banner(ready("behind"));

    expect(html).toContain("Mettez l&#x27;app à jour");
    expect(html).not.toContain("Mettre l&#x27;agent à jour");
    expect(html).toContain("ne connaît pas encore");
  });

  it("says a server of another generation gets repaired, and opens the assistant that repairs it", () => {
    const html = banner({
      serverId: "srv-1",
      status: "ready",
      update: {
        config: null,
        floor: "0.1.0",
        installed: "0.0.9",
        offer: OFFER,
        order: "ahead",
        platform: true,
        verdict: "agent_too_old",
      },
    });

    expect(html).toContain("Ce serveur est trop en arrière");
    expect(html).toContain(
      "Cet agent est trop ancien pour cette app. Réinstallez-le avec l&#x27;assistant : vos services restent en place."
    );
    expect(html).toContain("Réinstaller l&#x27;agent");
    expect(html).not.toContain("écran de réparation");
    expect(html).not.toContain("Mettre l&#x27;agent à jour");
  });

  it("stays silent when both versions match", () => {
    expect(banner(ready("same"))).toBe("");
    expect(banner({ status: "idle" })).toBe("");
  });

  it("offers the update without an embedded signature when the console answers", () => {
    const html = banner(ready("ahead", { ...OFFER, signed: false }, true));

    expect(html).toContain("Mettre l&#x27;agent à jour");
    expect(html).not.toContain("l&#x27;agent refuserait la mise à jour");
    expect(html).not.toContain('disabled=""');
  });

  it("disables the button when the console is silent and the signature is missing", () => {
    const html = banner(ready("ahead", { ...OFFER, signed: false }, false));

    expect(html).toContain("l&#x27;agent refuserait la mise à jour");
    expect(html).toContain("n&#x27;atteint plus la console");
    expect(html).toContain('disabled=""');
  });

  it("does not require the console when the app carries the signature", () => {
    const html = banner(ready("ahead", OFFER, false));

    expect(html).not.toContain("l&#x27;agent refuserait la mise à jour");
    expect(html).not.toContain('disabled=""');
  });

  it("shows the agent's refusal and its fix, without announcing a success", () => {
    const html = banner(
      ready("ahead"),
      {
        error: {
          code: "bad_signature",
          fix: "Relance la mise à jour depuis l'app.",
          message: "le binaire ne correspond pas à sa signature",
        },
        serverId: "srv-1",
        status: "failed",
      },
      ["version 0.4.0 téléchargée"]
    );

    expect(html).toContain("le binaire ne correspond pas à sa signature");
    expect(html).toContain("Relance la mise à jour depuis l&#x27;app.");
    expect(html).not.toContain("remplacé par");
  });

  it("says what the agent replaced when it succeeded", () => {
    const html = banner(ready("ahead"), {
      result: {
        migration: null,
        upgrade: {
          previous_version: "0.3.0",
          restarting: true,
          version: "0.4.0",
        },
      },
      serverId: "srv-1",
      status: "done",
    });

    expect(html).toContain(
      "Agent 0.3.0 remplacé par 0.4.0, service redémarré."
    );
  });

  it("states the revision reached when the migration carried something", () => {
    const html = banner(ready("ahead"), {
      result: {
        migration: {
          applied: [{ id: 1, ms: 12, slug: "rename-tz" }],
          expected: 1,
          pending: [],
          restored: false,
          revision: 1,
          state: "current",
        },
        upgrade: {
          previous_version: "0.3.0",
          restarting: true,
          version: "0.4.0",
        },
      },
      serverId: "srv-1",
      status: "done",
    });

    expect(html).toContain("Configuration migrée en révision 1.");
  });
});

describe("a configuration that is not the shape the agent reads", () => {
  const OWED: ConfigRevision = { expected: 4, revision: 3, state: "pending" };

  it("takes precedence over any version question", () => {
    const html = banner(ready("ahead", OFFER, true, OWED));

    expect(html).toContain("Configuration à migrer");
    expect(html).not.toContain("Mise à jour disponible");
  });

  it("states the migration that refused and what was put back in place", () => {
    const html = banner(
      ready("ahead", OFFER, true, { ...OWED, state: "failed" }),
      { status: "idle" },
      [],
      {
        result: {
          applied: [],
          backup: "20260911T100000Z-r3",
          expected: 4,
          failure: { id: 4, message: "install.json illisible", slug: "split" },
          pending: [4],
          restored: true,
          revision: 3,
          state: "failed",
        },
        serverId: "srv-1",
        status: "done",
      }
    );

    expect(html).toContain(
      "Migration 4 (split) refusée : install.json illisible"
    );
    expect(html).toContain("ont été remis en place");
  });

  it("points to the update when the agent is older than its configuration", () => {
    const html = banner(
      ready("same", OFFER, true, { expected: 3, revision: 5, state: "ahead" })
    );

    expect(html).toContain("Configuration plus récente que cet agent");
  });
});

const STEPS: ModuleProgress[] = [
  {
    id: "runtime.node",
    ms: 1200,
    status: "ok",
    steps: [{ ms: 1200, status: "ok", step: "paquet" }],
  },
  {
    id: "db.postgres",
    ms: 3400,
    status: "fail",
    steps: [
      {
        ms: 3400,
        replay: "pupitred install --only=db.postgres",
        status: "fail",
        step: "paquet",
      },
    ],
  },
];

function panel(state: ModulesState, steps: ModuleProgress[] = []): string {
  return renderToStaticMarkup(
    <ModuleUpgradePanel
      modules={["runtime.node", "db.postgres"]}
      nameOf={(id) => id}
      onUpgrade={NOOP}
      state={state}
      steps={steps}
    />
  );
}

describe("the module update", () => {
  it("offers to replay what the agent installed", () => {
    expect(panel({ status: "idle" })).toContain("Tout mettre à jour");
  });

  it("shows the steps, the failure and the agent's replay command", () => {
    const html = panel({ serverId: "srv-1", status: "running" }, STEPS);

    expect(html).toContain('data-module="db.postgres"');
    expect(html).toContain("pupitred install --only=db.postgres");
  });

  it("renders the report with its path, failures and warnings kept apart", () => {
    const html = panel(
      {
        result: {
          failed: ["db.postgres"],
          report_path: "/var/log/pupitre/upgrade.json",
          warned: ["runtime.node"],
        },
        serverId: "srv-1",
        status: "done",
      },
      STEPS
    );

    expect(html).toContain('data-failed="db.postgres"');
    expect(html).toContain('data-warned="runtime.node"');
    expect(html).toContain("/var/log/pupitre/upgrade.json");
  });
});
