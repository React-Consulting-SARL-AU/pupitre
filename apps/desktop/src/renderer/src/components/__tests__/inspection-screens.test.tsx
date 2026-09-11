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

/**
 * Four probe reports, four screens. The harness is `react-dom/server`: these
 * components hold no state and touch no DOM API, so a static render says
 * everything a browser would.
 */

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

describe("machine nue", () => {
  const html = screen(BARE);

  it("porte le verdict bare et le résumé de la machine", () => {
    expect(html).toContain('data-kind="bare"');
    expect(text(html)).toContain("Prête à être installée");
    expect(text(html)).toContain("Distribution ubuntu 24.04");
    expect(text(html)).toContain("Architecture amd64");
    expect(text(html)).toContain("Mémoire 8,0 Go");
    expect(text(html)).toContain("Disque libre 38,4 Go");
  });

  it("propose l'installation, sur la barre où l'étape finit", () => {
    expect(buttons(html)).toEqual(["Installer", "Choisir un autre serveur"]);
    expect(html.indexOf('data-actions="inspection"')).toBeLessThan(
      html.indexOf(">Installer<")
    );
  });
});

describe("serveur déjà géré", () => {
  const html = screen(MANAGED);

  it("montre la version de l'agent et la mise à jour disponible", () => {
    expect(html).toContain('data-kind="managed"');
    expect(text(html)).toContain("pupitred 0.3.1");
    expect(text(html)).toContain(
      "Une version plus récente de l'agent est disponible."
    );
  });

  it("propose la mise à jour et la suite", () => {
    expect(buttons(html)).toEqual([
      "Mettre à jour",
      "Continuer",
      "Choisir un autre serveur",
    ]);
  });

  it("s'en tient à la suite quand l'agent est à jour", () => {
    const uptodate = screen(MANAGED_UP_TO_DATE);

    expect(text(uptodate)).toContain("L'agent est à jour.");
    expect(buttons(uptodate)).toEqual([
      "Continuer",
      "Choisir un autre serveur",
    ]);
  });
});

describe("serveur occupé", () => {
  const html = screen(OCCUPIED);

  it("liste les raisons de la sonde, dans son ordre et ses mots", () => {
    expect(html).toContain('data-kind="occupied"');

    const rendered = text(html);
    let cursor = -1;

    for (const reason of OCCUPIED.verdict.reasons) {
      const at = rendered.indexOf(text(reason).trim());
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("liste les remèdes de la sonde en dessous des raisons", () => {
    const rendered = text(html);
    const lastReason = rendered.indexOf(
      text(OCCUPIED.verdict.reasons.at(-1) ?? "").trim()
    );

    for (const fix of OCCUPIED.verdict.fixes) {
      expect(rendered.indexOf(text(fix).trim())).toBeGreaterThan(lastReason);
    }
  });

  it("laisse installer quand même, ou changer de serveur", () => {
    expect(buttons(html)).toEqual([
      "Installer quand même",
      "Choisir un autre serveur",
    ]);
  });
});

describe("serveur incompatible", () => {
  const html = screen(INCOMPATIBLE);

  it("rend les raisons et les remèdes tels quels", () => {
    expect(html).toContain('data-kind="incompatible"');

    const rendered = text(html);

    for (const reason of INCOMPATIBLE.verdict.reasons) {
      expect(rendered).toContain(text(reason).trim());
    }
    for (const fix of INCOMPATIBLE.verdict.fixes) {
      expect(rendered).toContain(text(fix).trim());
    }
  });

  it("ne propose que de choisir un autre serveur", () => {
    expect(buttons(html)).toEqual(["Choisir un autre serveur"]);
  });
});

describe("les quatre verdicts", () => {
  it("se distinguent sans couleur, par leur forme et leur titre", () => {
    const shapes = [BARE, MANAGED, OCCUPIED, INCOMPATIBLE].map(
      (probe) => screen(probe).match(/data-shape="([^"]*)"/)?.[1] ?? ""
    );

    expect(new Set(shapes).size).toBe(4);
  });

  it("n'inventent aucune phrase que la sonde n'a pas dite", () => {
    for (const probe of [OCCUPIED, INCOMPATIBLE]) {
      const rendered = text(screen(probe));

      for (const line of [...probe.verdict.reasons, ...probe.verdict.fixes]) {
        expect(rendered).toContain(text(line).trim());
      }
    }
  });

  it("ne répètent pas un verdict que le titre dit déjà", () => {
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
