import { describe, expect, it } from "bun:test";
import type { HardenOutcome } from "@shared/harden";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingDoneScreen } from "../onboarding/onboarding-done-screen";
import { OnboardingHardenOutcome } from "../onboarding/onboarding-harden-outcome";
import { OnboardingReplayNotice } from "../onboarding/onboarding-replay-notice";

const REASON =
  "Aucune clé n'ouvre le compte dev : /home/dev/.ssh/authorized_keys est vide.";

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const CLOSED: HardenOutcome = {
  harden: { next_user: "dev", root_closed: true },
  reconnected: true,
  user: "dev",
};

const KEPT: HardenOutcome = {
  harden: { next_user: "root", reason: REASON, root_closed: false },
  reconnected: false,
  user: null,
};

describe("le verdict du durcissement", () => {
  it("dit que root est fermé et sur quel compte l'app parle", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenOutcome outcome={CLOSED} />
    );

    expect(text(html)).toContain("Root est fermé");
    expect(text(html)).toContain("dev");
    expect(text(html)).not.toContain("Réessayer");
  });

  it("garde root, rend la raison telle quelle et propose de réessayer", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenOutcome outcome={KEPT} />
    );

    expect(text(html)).toContain(REASON);
    expect(text(html)).toContain("Root reste ouvert");
    expect(text(html)).toContain("Réessayer");
  });

  it("dit pourquoi la reconnexion a échoué, avec le remède de l'agent", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenOutcome
        outcome={{
          ...CLOSED,
          error: {
            code: "disconnected",
            fix: "Vérifie que la clé de cet ordinateur est dans /home/dev/.ssh/authorized_keys.",
            message: "La connexion en dev n'a pas abouti.",
          },
          reconnected: false,
        }}
      />
    );

    expect(text(html)).toContain("La connexion en dev n'a pas abouti.");
    expect(text(html)).toContain(
      "Vérifie que la clé de cet ordinateur est dans /home/dev/.ssh/authorized_keys."
    );
  });
});

describe("la fin du parcours", () => {
  it("montre le compte auquel l'app est connectée", () => {
    const html = renderToStaticMarkup(
      <OnboardingDoneScreen rootClosed serverName="Staging" user="dev" />
    );

    expect(text(html)).toContain("Connecté en dev");
    expect(text(html)).toContain("Root est fermé");
  });
});

describe("le rejeu d'un module à secret", () => {
  it("dit que le secret a été oublié et qu'il faut le ressaisir", () => {
    const html = renderToStaticMarkup(
      <OnboardingReplayNotice moduleName="PostgreSQL 17" />
    );

    expect(text(html)).toContain("PostgreSQL 17");
    expect(text(html)).toContain("oublié");
  });
});
