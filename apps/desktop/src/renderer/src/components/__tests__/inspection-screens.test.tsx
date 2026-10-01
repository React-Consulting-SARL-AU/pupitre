import { describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BARE,
  INCOMPATIBLE,
  MANAGED,
  MANAGED_UP_TO_DATE,
  OCCUPIED,
} from "../../__tests__/probe-fixtures";
import { OnboardingInspectionResult } from "../onboarding/onboarding-inspection-result";

function screen(probe: ProbeResult): string {
  return renderToStaticMarkup(
    <OnboardingInspectionResult probe={probe} serverName="staging" />
  );
}

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) =>
    text(match[1]).trim()
  );
}

describe("bare machine", () => {
  const html = screen(BARE);

  it("carries the bare verdict and the machine summary", () => {
    expect(html).toContain('data-kind="bare"');
    expect(text(html)).toContain("Prêt à être installé");
    expect(text(html)).toContain("Distribution ubuntu 24.04");
    expect(text(html)).toContain("Architecture amd64");
    expect(text(html)).toContain("Mémoire 8,0 Go");
    expect(text(html)).toContain("Disque libre 38,4 Go");
  });

  it("offers the installation, on the bar where the step ends", () => {
    expect(buttons(html)).toEqual(["Installer", "Choisir un autre serveur"]);
    expect(html.indexOf('data-actions="inspection"')).toBeLessThan(
      html.indexOf(">Installer<")
    );
  });
});

describe("already managed server", () => {
  const html = screen(MANAGED);

  it("shows the agent version and the available update", () => {
    expect(html).toContain('data-kind="managed"');
    expect(text(html)).toContain("pupitred 0.3.1");
    expect(text(html)).toContain(
      "Une version plus récente de l'agent est disponible."
    );
  });

  it("offers the update and the next step", () => {
    expect(buttons(html)).toEqual([
      "Mettre à jour",
      "Continuer",
      "Choisir un autre serveur",
    ]);
  });

  it("sticks to the next step when the agent is up to date", () => {
    const uptodate = screen(MANAGED_UP_TO_DATE);

    expect(text(uptodate)).toContain("L'agent est à jour.");
    expect(buttons(uptodate)).toEqual([
      "Continuer",
      "Choisir un autre serveur",
    ]);
  });
});

describe("busy server", () => {
  const html = screen(OCCUPIED);

  it("lists the probe's reasons, in its order and its words", () => {
    expect(html).toContain('data-kind="occupied"');

    const rendered = text(html);
    let cursor = -1;

    for (const reason of OCCUPIED.verdict.reasons) {
      const at = rendered.indexOf(text(reason).trim());

      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("lists the probe's fixes below the reasons", () => {
    const rendered = text(html);
    const lastReason = rendered.indexOf(
      text(OCCUPIED.verdict.reasons.at(-1) ?? "").trim()
    );

    for (const fix of OCCUPIED.verdict.fixes) {
      expect(rendered.indexOf(text(fix).trim())).toBeGreaterThan(lastReason);
    }
  });

  it("lets the reader install anyway, or change server", () => {
    expect(buttons(html)).toEqual([
      "Installer quand même",
      "Choisir un autre serveur",
    ]);
  });
});

describe("incompatible server", () => {
  const html = screen(INCOMPATIBLE);

  it("renders the reasons and the fixes as they are", () => {
    expect(html).toContain('data-kind="incompatible"');

    const rendered = text(html);

    for (const reason of INCOMPATIBLE.verdict.reasons) {
      expect(rendered).toContain(text(reason).trim());
    }
    for (const fix of INCOMPATIBLE.verdict.fixes) {
      expect(rendered).toContain(text(fix).trim());
    }
  });

  it("only offers to choose another server", () => {
    expect(buttons(html)).toEqual(["Choisir un autre serveur"]);
  });
});

describe("the four verdicts", () => {
  it("are told apart without colour, by their shape and their title", () => {
    const shapes = [BARE, MANAGED, OCCUPIED, INCOMPATIBLE].map(
      (probe) => screen(probe).match(/data-shape="([^"]*)"/)?.[1] ?? ""
    );

    expect(new Set(shapes).size).toBe(4);
  });

  it("invent no sentence the probe did not say", () => {
    for (const probe of [OCCUPIED, INCOMPATIBLE]) {
      const rendered = text(screen(probe));

      for (const line of [...probe.verdict.reasons, ...probe.verdict.fixes]) {
        expect(rendered).toContain(text(line).trim());
      }
    }
  });

  it("do not repeat a verdict the title already states", () => {
    for (const probe of [BARE, MANAGED]) {
      const rendered = text(screen(probe));

      for (const line of probe.verdict.reasons) {
        expect(rendered).not.toContain(text(line).trim());
      }

      for (const fix of probe.verdict.fixes) {
        expect(rendered).toContain(text(fix).trim());
      }
    }
  });
});
