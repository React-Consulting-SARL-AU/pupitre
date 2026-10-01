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

describe("modules during the installation", () => {
  const html = renderToStaticMarkup(
    <InstallProgress modules={MODULES} nameOf={nameOf} />
  );

  it("names each module and its step", () => {
    expect(text(html)).toContain("Socle système");
    expect(text(html)).toContain("paquets");
    expect(text(html)).toContain("mise");
  });

  it("shows the duration of each finished step", () => {
    expect(text(html)).toContain(humanMs(12_400));
    expect(text(html)).toContain(humanMs(9100));
  });

  it("counts the wait of what is still running, module and step", () => {
    const running = html.slice(html.indexOf('data-module="runtime.node"'));

    expect(running.match(/data-live="duration"/g)?.length).toBe(2);
  });

  it("aligns the title on the logo plate, bullets included", () => {
    expect(html).toContain("min-height:30px");
    expect(html).not.toContain("items-baseline");
  });

  it("tells states apart by shape before colour", () => {
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

  it("shows the replay command the agent gave, as it is", () => {
    expect(text(html)).toContain("pupitred install db.mysql");
  });
});

describe("what a step said", () => {
  const rows = (step: ModuleProgress["steps"][number]) =>
    renderToStaticMarkup(
      <ul>
        <InstallStepRow step={step} />
      </ul>
    );

  it("shows a failure line as the agent wrote it", () => {
    const html = rows({
      message: "E: Unable to locate package mysql-server",
      ms: 9100,
      status: "fail",
      step: "apt",
    });

    expect(tag(html, "data-step-message", "fail")).toBeTruthy();
    expect(text(html)).toContain("E: Unable to locate package mysql-server");
  });

  it("shows the warning of a passed step, under its name", () => {
    const html = rows({
      message: "Le fuseau demandé est inconnu : Etc/UTC a été gardé.",
      ms: 12,
      status: "skip",
      step: "fuseau",
    });

    expect(tag(html, "data-step-message", "warn")).toBeTruthy();
    expect(text(html)).toContain("Etc/UTC a été gardé");
  });

  it("says nothing under a step that had nothing to say", () => {
    const html = rows({ ms: 12_400, status: "ok", step: "paquets" });

    expect(html).not.toContain("data-step-message");
  });

  it("does not repeat a failure line in the module list", () => {
    const html = renderToStaticMarkup(
      <InstallProgress modules={MODULES} nameOf={nameOf} />
    );

    expect(text(html).match(/Unable to locate package/g)).toHaveLength(1);
  });
});

describe("the agent upload", () => {
  it("says what is leaving and where, rather than a spinning dot", () => {
    const html = renderToStaticMarkup(<InstallSending />);

    expect(text(html)).toContain("L'agent est copié sur le serveur.");
    expect(html).toContain('data-shape="breathing"');
  });

  it("states clearly that the app carries no binary", () => {
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

describe("the final report", () => {
  const result: InstallResult = {
    failed: ["db.mysql"],
    warned: ["core.system"],
    report_path: "/var/lib/pupitre/report.json",
  };

  it("lists failed and warned as the agent returns them", () => {
    const html = renderToStaticMarkup(
      <InstallReport modules={MODULES} nameOf={nameOf} result={result} />
    );

    expect(tag(html, "data-failed", "db.mysql")).toBeTruthy();
    expect(tag(html, "data-warned", "core.system")).toBeTruthy();
    expect(text(html)).toContain("Etc/UTC a été gardé");
  });

  it("states the failure plainly, keeps the agent's line under Détails", () => {
    const html = renderToStaticMarkup(
      <InstallReport modules={MODULES} nameOf={nameOf} result={result} />
    );

    expect(text(html)).toContain("MySQL n'a pas pu être installé.");
    expect(text(html)).toContain("pupitred install db.mysql");
    expect(html).toMatch(
      /aria-expanded="false"[\s\S]*hidden=""[^>]*>[\s\S]*apt : E: Unable to locate package mysql-server/
    );
  });

  it("carries a Réessayer button per failed module, and says what it changes", () => {
    const html = renderToStaticMarkup(
      <InstallReport modules={MODULES} nameOf={nameOf} result={result} />
    );

    expect(html.match(/>Réessayer</g)).toHaveLength(1);
    expect(text(html)).toContain("les autres services ne sont pas concernés");
  });

  it("offers to retry everything at once when several modules failed", () => {
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

  it("offers to continue when nothing blocking failed", () => {
    const html = renderToStaticMarkup(
      <InstallOutcomeBar blocking={[]} nameOf={nameOf} result={result} />
    );

    expect(text(html)).toContain("Continuer");
    expect(text(html)).toContain("vous pourrez réessayer plus tard");
  });

  it("does not offer to continue when a required module failed", () => {
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

  it("stays silent when nothing failed or warned", () => {
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

describe("the journal", () => {
  it("is folded and keeps the lines in order", () => {
    const html = renderToStaticMarkup(
      <InstallLog lines={["core.system · paquets · ok · 12,4 s", "seconde"]} />
    );

    expect(html).toContain("data-details");
    expect(html).not.toMatch(/data-open=""[^>]*data-details/);
    expect(text(html).indexOf("core.system")).toBeLessThan(
      text(html).indexOf("seconde")
    );
  });

  it("is not displayed while there is nothing to read", () => {
    expect(renderToStaticMarkup(<InstallLog lines={[]} />)).toBe("");
  });
});

describe("durations written to be compared", () => {
  it("stays in seconds under a minute", () => {
    expect(humanMs(900)).toBe("0,9 s");
    expect(humanMs(12_400)).toBe("12,4 s");
  });

  it("switches to minutes beyond that", () => {
    expect(humanMs(80_000)).toBe("1 min 20 s");
  });

  it("states the megabytes of the uploaded binary", () => {
    expect(humanBytes(18_000_000)).toBe("18,0 Mo");
  });
});
