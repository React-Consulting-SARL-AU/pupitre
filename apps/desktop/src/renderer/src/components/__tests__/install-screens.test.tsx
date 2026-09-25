import { describe, expect, it } from "bun:test";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import { renderToStaticMarkup } from "react-dom/server";
import { humanBytes, humanMs } from "../../lib/duration";
import type { ModuleProgress } from "../../stores/install";
import { InstallLog } from "../install/install-log";
import { InstallOutcomeBar } from "../install/install-outcome-bar";
import { InstallProgress } from "../install/install-progress";
import { InstallReport } from "../install/install-report";
import { InstallSending } from "../install/install-sending";
import { InstallStepRow } from "../install/install-step-row";

const NAMES: Record<string, string> = {
  "core.system": "Socle système",
  "db.mysql": "MySQL",
  "runtime.node": "Node.js",
};

function nameOf(id: string): string {
  return NAMES[id] ?? id;
}

function module_(
  id: string,
  status: ModuleProgress["status"],
  steps: ModuleProgress["steps"]
): ModuleProgress {
  return {
    id,
    ms: steps
      .filter((step) => step.status !== "start")
      .reduce((total, step) => total + step.ms, 0),
    status,
    steps,
  };
}

const MODULES: ModuleProgress[] = [
  module_("core.system", "ok", [
    { step: "paquets", status: "ok", ms: 12_400 },
    {
      step: "fuseau",
      status: "skip",
      ms: 12,
      message: "Le fuseau demandé est inconnu : Etc/UTC a été gardé.",
    },
  ]),
  module_("db.mysql", "fail", [
    {
      step: "apt",
      status: "fail",
      ms: 9100,
      replay: "pupitred install db.mysql",
      message: "E: Unable to locate package mysql-server",
    },
  ]),
  module_("runtime.node", "running", [
    { step: "mise", status: "start", ms: 0 },
  ]),
];

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

// Attribute order in the rendered tag is not stable, so the whole opening tag is matched.
function tag(html: string, attribute: string, value: string): string {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<[a-z]+[^>]*${attribute}="${escaped}"[^>]*>`)
  );

  return match?.[0] ?? "";
}

describe("les modules pendant l'installation", () => {
  const html = renderToStaticMarkup(
    <InstallProgress modules={MODULES} nameOf={nameOf} />
  );

  it("nomme chaque module et son étape", () => {
    expect(text(html)).toContain("Socle système");
    expect(text(html)).toContain("paquets");
    expect(text(html)).toContain("mise");
  });

  it("montre la durée de chaque étape terminée", () => {
    expect(text(html)).toContain(humanMs(12_400));
    expect(text(html)).toContain(humanMs(9100));
  });

  it("compte l'attente de ce qui tourne encore, module et étape", () => {
    const running = html.slice(html.indexOf('data-module="runtime.node"'));

    expect(running.match(/data-live="duration"/g)?.length).toBe(2);
  });

  it("aligne le titre sur la plaque du logo, puces comprises", () => {
    expect(html).toContain("min-height:30px");
    expect(html).not.toContain("items-baseline");
  });

  it("distingue les états par la forme avant la couleur", () => {
    expect(tag(html, "data-module", "core.system")).toContain(
      'data-status="ok"'
    );
    expect(tag(html, "data-module", "db.mysql")).toContain(
      'data-status="fail"'
    );
    expect(tag(html, "data-module", "runtime.node")).toContain(
      'data-status="running"'
    );

    expect(html).toContain('data-shape="breathing"');
    expect(html).toContain('data-shape="struck"');
    expect(html).toContain('data-shape="filled"');
  });

  it("montre la commande de rejeu que l'agent a donnée, telle quelle", () => {
    expect(text(html)).toContain("pupitred install db.mysql");
  });
});

describe("ce qu'une étape a dit", () => {
  const rows = (step: ModuleProgress["steps"][number]) =>
    renderToStaticMarkup(
      <ul>
        <InstallStepRow step={step} />
      </ul>
    );

  it("montre la ligne d'un échec telle que l'agent l'a écrite", () => {
    const html = rows({
      message: "E: Unable to locate package mysql-server",
      ms: 9100,
      status: "fail",
      step: "apt",
    });

    expect(tag(html, "data-step-message", "fail")).toBeTruthy();
    expect(text(html)).toContain("E: Unable to locate package mysql-server");
  });

  it("montre l'avertissement d'une étape passée, sous son nom", () => {
    const html = rows({
      message: "Le fuseau demandé est inconnu : Etc/UTC a été gardé.",
      ms: 12,
      status: "skip",
      step: "fuseau",
    });

    expect(tag(html, "data-step-message", "warn")).toBeTruthy();
    expect(text(html)).toContain("Etc/UTC a été gardé");
  });

  it("ne dit rien sous une étape qui n'avait rien à dire", () => {
    const html = rows({ ms: 12_400, status: "ok", step: "paquets" });

    expect(html).not.toContain("data-step-message");
  });

  it("ne répète pas la ligne d'un échec dans la liste des modules", () => {
    const html = renderToStaticMarkup(
      <InstallProgress modules={MODULES} nameOf={nameOf} />
    );

    expect(text(html).match(/Unable to locate package/g)).toHaveLength(1);
  });
});

describe("l'envoi de l'agent", () => {
  it("dit ce qui part et où, plutôt qu'un point qui tourne", () => {
    const html = renderToStaticMarkup(<InstallSending />);

    expect(text(html)).toContain("L'agent est copié sur le serveur.");
    expect(html).toContain('data-shape="breathing"');
  });

  it("dit clairement que l'app ne porte aucun binaire", () => {
    const html = renderToStaticMarkup(
      <InstallReport
        modules={[]}
        nameOf={nameOf}
        result={{
          failed: [],
          warned: [],
          report_path: "/var/lib/pupitre/report.json",
        }}
      />
    );

    expect(text(html)).toContain("/var/lib/pupitre/report.json");
  });
});

describe("le rapport final", () => {
  const result: InstallResult = {
    failed: ["db.mysql"],
    warned: ["core.system"],
    report_path: "/var/lib/pupitre/report.json",
  };

  it("liste failed et warned tels que l'agent les renvoie", () => {
    const html = renderToStaticMarkup(
      <InstallReport modules={MODULES} nameOf={nameOf} result={result} />
    );

    expect(tag(html, "data-failed", "db.mysql")).toBeTruthy();
    expect(tag(html, "data-warned", "core.system")).toBeTruthy();
    expect(text(html)).toContain("Etc/UTC a été gardé");
  });

  it("dit l'échec en clair, garde la ligne de l'agent sous Détails", () => {
    const html = renderToStaticMarkup(
      <InstallReport modules={MODULES} nameOf={nameOf} result={result} />
    );

    expect(text(html)).toContain("MySQL n'a pas pu être installé.");
    expect(text(html)).toContain("pupitred install db.mysql");
    expect(html).toMatch(
      /aria-expanded="false"[\s\S]*hidden=""[^>]*>[\s\S]*apt : E: Unable to locate package mysql-server/
    );
  });

  it("porte un bouton Réessayer par module en échec, et dit ce que ça change", () => {
    const html = renderToStaticMarkup(
      <InstallReport modules={MODULES} nameOf={nameOf} result={result} />
    );

    expect(html.match(/>Réessayer</g)).toHaveLength(1);
    expect(text(html)).toContain("les autres services ne sont pas concernés");
  });

  it("propose de tout réessayer d'un coup quand plusieurs modules ont échoué", () => {
    const html = renderToStaticMarkup(
      <InstallOutcomeBar
        blocking={[]}
        nameOf={nameOf}
        onReplayAll={() => undefined}
        result={{ ...result, failed: ["db.mysql", "runtime.node"] }}
      />
    );

    expect(text(html)).toContain("Réessayer les 2 services");
  });

  it("propose de continuer quand rien de bloquant n'a échoué", () => {
    const html = renderToStaticMarkup(
      <InstallOutcomeBar blocking={[]} nameOf={nameOf} result={result} />
    );

    expect(text(html)).toContain("Continuer");
    expect(text(html)).toContain("vous pourrez réessayer plus tard");
  });

  it("ne propose pas de continuer quand un module obligatoire a échoué", () => {
    const html = renderToStaticMarkup(
      <InstallOutcomeBar
        blocking={["core.system"]}
        nameOf={nameOf}
        result={{ ...result, failed: ["core.system"] }}
      />
    );

    const button = html.match(/<button[^>]*>[^<]*(?:<[^>]+>)*Continuer/)?.[0];

    expect(button).toContain('disabled=""');
    expect(text(html)).toContain("Socle système : la suite en dépend.");
  });

  it("se tait quand rien n'a échoué ni averti", () => {
    const html = renderToStaticMarkup(
      <InstallReport
        modules={MODULES}
        nameOf={nameOf}
        result={{
          failed: [],
          warned: [],
          report_path: "/var/lib/pupitre/x.json",
        }}
      />
    );

    expect(html).not.toContain("data-failed");
    expect(html).not.toContain("data-warned");
    expect(text(html)).toContain("Tout est installé.");
  });
});

describe("le journal", () => {
  it("est replié et garde les lignes dans l'ordre", () => {
    const html = renderToStaticMarkup(
      <InstallLog lines={["core.system · paquets · ok · 12,4 s", "seconde"]} />
    );

    expect(html).toContain("data-details");
    expect(html).not.toMatch(/data-open=""[^>]*data-details/);
    expect(text(html).indexOf("core.system")).toBeLessThan(
      text(html).indexOf("seconde")
    );
  });

  it("ne s'affiche pas tant qu'il n'y a rien à lire", () => {
    expect(renderToStaticMarkup(<InstallLog lines={[]} />)).toBe("");
  });
});

describe("les durées écrites pour être comparées", () => {
  it("reste en secondes sous la minute", () => {
    expect(humanMs(900)).toBe("0,9 s");
    expect(humanMs(12_400)).toBe("12,4 s");
  });

  it("passe aux minutes au-delà", () => {
    expect(humanMs(80_000)).toBe("1 min 20 s");
  });

  it("dit les mégaoctets du binaire envoyé", () => {
    expect(humanBytes(18_000_000)).toBe("18,0 Mo");
  });
});
