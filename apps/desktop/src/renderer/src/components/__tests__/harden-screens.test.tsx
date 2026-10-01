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

describe("the hardening verdict", () => {
  it("says root access is closed and which account the app talks on", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenOutcome outcome={CLOSED} />
    );

    expect(text(html)).toContain("L'accès root est fermé");
    expect(text(html)).toContain("dev");
    expect(text(html)).not.toContain("Réessayer");
  });

  it("keeps the access, renders the reason as it comes and offers to retry", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenOutcome outcome={REFUSED} />
    );

    expect(text(html)).toContain(REASON);
    expect(text(html)).toContain("L'accès root reste ouvert");
    expect(text(html)).toContain("Réessayer");
  });

  it("says the access is kept on request, without offering to retry", () => {
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

  it("says why the reconnection failed, with the agent's fix", () => {
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

describe("the end of the flow", () => {
  it("shows the account the app is connected to", () => {
    const html = renderToStaticMarkup(
      <OnboardingDoneScreen root="closed" serverName="Staging" user="dev" />
    );

    expect(html).toContain('data-actions="done"');

    expect(text(html)).toContain("Connecté en tant que dev");
    expect(text(html)).toContain("L'accès root est fermé");
  });

  it("says the access stayed open because it was requested", () => {
    const html = renderToStaticMarkup(
      <OnboardingDoneScreen root="kept" serverName="Staging" user="dev" />
    );

    expect(text(html)).toContain(
      "L'accès root est resté ouvert, comme demandé"
    );
    expect(text(html)).not.toContain("relancez la sécurisation");
    expect(text(html)).not.toContain("Relancer la sécurisation");
  });

  it("offers to rerun the hardening when root access stayed open", () => {
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

describe("the replay of a module with a secret", () => {
  it("says the secret was not kept and must be entered again", () => {
    const html = renderToStaticMarkup(
      <OnboardingReplayNotice moduleName="PostgreSQL 17" />
    );

    expect(text(html)).toContain("PostgreSQL 17");
    expect(text(html)).toContain("n'a pas gardés");
  });
});
