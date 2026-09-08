import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModuleProgress } from "../../lib/module-progress";
import type {
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
  platform = true
): UpdateState {
  return {
    serverId: "srv-1",
    status: "ready",
    update: {
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
  journal: string[] = []
): string {
  return renderToStaticMarkup(
    <AgentUpdateBanner
      journal={journal}
      onHide={NOOP}
      onUpgrade={NOOP}
      state={state}
      upgrade={upgrade}
    />
  );
}

describe("le bandeau de mise à jour", () => {
  it("offre la mise à jour et porte les notes de la version", () => {
    const html = banner(ready("ahead"));

    expect(html).toContain("Mise à jour disponible");
    expect(html).toContain("0.3.0 → 0.4.0");
    expect(html).toContain(
      "Retour arrière si la nouvelle version ne répond pas."
    );
    expect(html).toContain("Mettre l&#x27;agent à jour");
  });

  it("dit de mettre l'app à jour sans rien barrer quand elle est derrière", () => {
    const html = banner(ready("behind"));

    expect(html).toContain("Mettez l&#x27;app à jour");
    expect(html).not.toContain("Mettre l&#x27;agent à jour");
    expect(html).toContain("continue de fonctionner");
  });

  it("dit qu'un serveur d'une autre génération se répare, sans rien proposer", () => {
    const html = banner({
      serverId: "srv-1",
      status: "ready",
      update: {
        floor: "0.1.0",
        installed: "0.0.9",
        offer: OFFER,
        order: "ahead",
        platform: true,
        verdict: "agent_too_old",
      },
    });

    expect(html).toContain("Ce serveur est trop en arrière");
    expect(html).toContain("écran de réparation");
    expect(html).not.toContain("Mettre l&#x27;agent à jour");
  });

  it("se tait quand les deux versions coïncident", () => {
    expect(banner(ready("same"))).toBe("");
    expect(banner({ status: "idle" })).toBe("");
  });

  it("offre la mise à jour sans signature embarquée quand la console répond", () => {
    const html = banner(ready("ahead", { ...OFFER, signed: false }, true));

    expect(html).toContain("Mettre l&#x27;agent à jour");
    expect(html).not.toContain("l&#x27;agent refuserait la mise à jour");
    expect(html).not.toContain('disabled=""');
  });

  it("désactive le bouton quand la console se tait et la signature manque", () => {
    const html = banner(ready("ahead", { ...OFFER, signed: false }, false));

    expect(html).toContain("l&#x27;agent refuserait la mise à jour");
    expect(html).toContain("n&#x27;atteint plus la console");
    expect(html).toContain('disabled=""');
  });

  it("n'exige pas la console quand l'app porte la signature", () => {
    const html = banner(ready("ahead", OFFER, false));

    expect(html).not.toContain("l&#x27;agent refuserait la mise à jour");
    expect(html).not.toContain('disabled=""');
  });

  it("montre le refus de l'agent et son remède, sans annoncer de réussite", () => {
    const html = banner(
      ready("ahead"),
      {
        error: {
          code: "bad_signature",
          fix: "Relance la mise à jour depuis l'app.",
          message: "le binaire ne correspond pas à sa signature",
        },
        status: "failed",
      },
      ["version 0.4.0 téléchargée"]
    );

    expect(html).toContain("le binaire ne correspond pas à sa signature");
    expect(html).toContain("Relance la mise à jour depuis l&#x27;app.");
    expect(html).not.toContain("remplacé par");
  });

  it("dit ce que l'agent a remplacé quand il a réussi", () => {
    const html = banner(ready("ahead"), {
      result: {
        previous_version: "0.3.0",
        restarting: true,
        version: "0.4.0",
      },
      status: "done",
    });

    expect(html).toContain(
      "Agent 0.3.0 remplacé par 0.4.0, service redémarré."
    );
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

describe("la mise à jour des modules", () => {
  it("propose de rejouer ce que l'agent a posé", () => {
    expect(panel({ status: "idle" })).toContain("Tout mettre à jour");
  });

  it("montre les étapes, l'échec et la commande de rejeu de l'agent", () => {
    const html = panel({ status: "running" }, STEPS);

    expect(html).toContain('data-module="db.postgres"');
    expect(html).toContain("pupitred install --only=db.postgres");
  });

  it("rend le rapport avec son chemin, échecs et avertissements séparés", () => {
    const html = panel(
      {
        result: {
          failed: ["db.postgres"],
          report_path: "/var/log/pupitre/upgrade.json",
          warned: ["runtime.node"],
        },
        status: "done",
      },
      STEPS
    );

    expect(html).toContain('data-failed="db.postgres"');
    expect(html).toContain('data-warned="runtime.node"');
    expect(html).toContain("/var/log/pupitre/upgrade.json");
  });
});
