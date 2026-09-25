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
  harden: { next_user: "dev", root_closed: true, root_kept: false },
  reconnected: true,
  user: "dev",
};

const KEPT: HardenOutcome = {
  harden: { next_user: "dev", root_closed: false, root_kept: true },
  reconnected: true,
  user: "dev",
};

const REFUSED: HardenOutcome = {
  harden: {
    next_user: "root",
    reason: REASON,
    root_closed: false,
    root_kept: false,
  },
  reconnected: false,
  user: null,
};

describe("le verdict du durcissement", () => {
  it("dit que l'accès root est fermé et sur quel compte l'app parle", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenOutcome outcome={CLOSED} />
    );

    expect(text(html)).toContain("L'accès root est fermé");
    expect(text(html)).toContain("dev");
    expect(text(html)).not.toContain("Réessayer");
  });

  it("garde l'accès, rend la raison telle quelle et propose de réessayer", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenOutcome outcome={REFUSED} />
    );

    expect(text(html)).toContain(REASON);
    expect(text(html)).toContain("L'accès root reste ouvert");
    expect(text(html)).toContain("Réessayer");
  });

  it("dit que l'accès est gardé à la demande, sans proposer de réessayer", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenOutcome outcome={KEPT} />
    );

    expect(text(html)).toContain("l'accès root reste ouvert");
    expect(text(html)).toContain("jamais avec un mot de passe");
    expect(text(html)).not.toContain("Réessayer");
    expect(text(html)).not.toContain(
      "L'accès root reste ouvert et rien n'a changé"
    );
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
      <OnboardingDoneScreen root="closed" serverName="Staging" user="dev" />
    );

    expect(html).toContain('data-actions="done"');

    expect(text(html)).toContain("Connecté en dev");
    expect(text(html)).toContain("L'accès root est fermé");
  });

  it("dit que l'accès est resté ouvert parce qu'on l'a demandé", () => {
    const html = renderToStaticMarkup(
      <OnboardingDoneScreen root="kept" serverName="Staging" user="dev" />
    );

    expect(text(html)).toContain(
      "L'accès root est resté ouvert, comme demandé"
    );
    expect(text(html)).not.toContain("relancez la sécurisation");
    expect(text(html)).not.toContain("Relancer la sécurisation");
  });

  it("offre de relancer la sécurisation quand l'accès root est resté ouvert", () => {
    const html = renderToStaticMarkup(
      <OnboardingDoneScreen
        onSecure={() => undefined}
        root="open"
        serverName="Staging"
        user="root"
      />
    );

    expect(text(html)).toContain("relancez la sécurisation");
    expect(text(html)).toContain("Relancer la sécurisation");
  });
});

describe("le rejeu d'un module à secret", () => {
  it("dit que le secret n'a pas été gardé et qu'il faut le ressaisir", () => {
    const html = renderToStaticMarkup(
      <OnboardingReplayNotice moduleName="PostgreSQL 17" />
    );

    expect(text(html)).toContain("PostgreSQL 17");
    expect(text(html)).toContain("n'a pas gardés");
  });
});
