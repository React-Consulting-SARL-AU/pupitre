import { describe, expect, it } from "bun:test";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import { renderToStaticMarkup } from "react-dom/server";
import { humanBytes, humanMs } from "../../lib/duration";
import type { ModuleProgress } from "../../stores/install";
import { InstallLog } from "../install/install-log";
import { InstallProgress } from "../install/install-progress";
import { InstallReport } from "../install/install-report";
import { InstallSending } from "../install/install-sending";

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
    { step: "fuseau", status: "skip", ms: 12 },
  ]),
  module_("db.mysql", "fail", [
    {
      step: "apt",
      status: "fail",
      ms: 9100,
      replay: "pupitred install db.mysql",
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

/** The opening tag that carries this attribute, whatever order it renders in. */
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

describe("l'envoi de l'agent", () => {
  it("dit ce qui part et où, plutôt qu'un point qui tourne", () => {
    const html = renderToStaticMarkup(<InstallSending arch="arm64" />);

    expect(text(html)).toContain("arm64");
    expect(html).toContain('data-shape="breathing"');
  });

  it("dit clairement que l'app ne porte aucun binaire", () => {
    const html = renderToStaticMarkup(
      <InstallReport
        blocking={[]}
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
      <InstallReport
        blocking={[]}
        modules={MODULES}
        nameOf={nameOf}
        result={result}
      />
    );

    expect(tag(html, "data-failed", "db.mysql")).toBeTruthy();
    expect(tag(html, "data-warned", "core.system")).toBeTruthy();
  });

  it("porte un bouton Rejouer par module en échec", () => {
    const html = renderToStaticMarkup(
      <InstallReport
        blocking={[]}
        modules={MODULES}
        nameOf={nameOf}
        result={result}
      />
    );

    expect(html.match(/Rejouer/g)).toHaveLength(1);
  });

  it("propose de continuer quand rien de bloquant n'a échoué", () => {
    const html = renderToStaticMarkup(
      <InstallReport
        blocking={[]}
        modules={MODULES}
        nameOf={nameOf}
        result={result}
      />
    );

    expect(text(html)).toContain("Continuer");
  });

  it("ne propose pas de continuer quand un module obligatoire a échoué", () => {
    const html = renderToStaticMarkup(
      <InstallReport
        blocking={["core.system"]}
        modules={MODULES}
        nameOf={nameOf}
        result={{ ...result, failed: ["core.system"] }}
      />
    );

    expect(text(html)).not.toContain("Continuer");
    expect(text(html)).toContain("Socle système");
  });

  it("se tait quand rien n'a échoué ni averti", () => {
    const html = renderToStaticMarkup(
      <InstallReport
        blocking={[]}
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
    expect(text(html)).toContain("Continuer");
  });
});

describe("le journal", () => {
  it("est replié et garde les lignes dans l'ordre", () => {
    const html = renderToStaticMarkup(
      <InstallLog lines={["core.system · paquets · ok · 12,4 s", "seconde"]} />
    );

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
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
