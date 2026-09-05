import { describe, expect, it } from "bun:test";
import type { AccountState, UsageRight } from "@shared/account";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountIdentityCard } from "../account/account-identity-card";
import { AccountSignInCard } from "../account/account-sign-in-card";
import { AccountUsageNotice } from "../account/account-usage-notice";
import { OnboardingEnrollmentNote } from "../onboarding/onboarding-enrollment-note";

const NOOP = () => undefined;

const CONSOLE_URL = "https://app.pupitre.test/dashboard";

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

const SIGNED_IN: AccountState = {
  build: "production",
  checkedAt: new Date().toISOString(),
  consoleUrl: CONSOLE_URL,
  device: {
    fingerprint: "SHA256:mac",
    id: "device-1",
    name: "MacBook d'Ada",
    publicKey: "ssh-ed25519 AAAA",
  },
  identity: {
    email: "ada@pupitre.studio",
    entitlement: "valid",
    name: "Ada Lovelace",
    organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
    organizations: [
      { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
    ],
    role: "owner",
  },
  sealed: true,
  usage: {
    entitlement: "valid",
    source: "platform",
    status: "granted",
    validUntil: "2026-09-11T10:00:00.000Z",
  },
};

function usage(html: UsageRight, checkedAt: string | null = null): string {
  return renderToStaticMarkup(
    <AccountUsageNotice checkedAt={checkedAt} usage={html} />
  );
}

describe("le droit d'usage", () => {
  it("distingue chaque état par une forme", () => {
    const shapes = [
      usage({
        entitlement: "valid",
        source: "platform",
        status: "granted",
        validUntil: null,
      }),
      usage({
        entitlement: "valid",
        source: "cache",
        status: "granted",
        validUntil: null,
      }),
      usage({
        entitlement: "none",
        source: "development",
        status: "granted",
        validUntil: null,
      }),
      usage({ consoleUrl: CONSOLE_URL, status: "absent" }),
      usage({
        consoleUrl: CONSOLE_URL,
        since: "2026-08-01T10:00:00.000Z",
        status: "stale",
      }),
      usage({ consoleUrl: CONSOLE_URL, status: "suspended" }),
    ].map((html) => html.match(/data-shape="([a-z]+)"/)?.[1]);

    expect(shapes).toEqual([
      "filled",
      "ringed",
      "empty",
      "empty",
      "struck",
      "struck",
    ]);
  });

  it("nomme les sept jours de tolérance quand le cache tient encore", () => {
    const html = usage(
      {
        entitlement: "valid",
        source: "cache",
        status: "granted",
        validUntil: "2026-09-11T10:00:00.000Z",
      },
      new Date().toISOString()
    );

    expect(text(html)).toContain("sept jours sans la plateforme");
    expect(html).toContain('data-usage="granted"');
  });

  it("dit qu'un build de production refuse d'installer sans compte", () => {
    const html = usage({ consoleUrl: CONSOLE_URL, status: "absent" });

    expect(text(html)).toContain("Aucun compte connecté");
    expect(text(html)).toContain("refuse d'installer un serveur sans compte");
  });
});

describe("la connexion", () => {
  it("propose de se connecter et d'ouvrir la console", () => {
    const html = renderToStaticMarkup(
      <AccountSignInCard
        consoleUrl={CONSOLE_URL}
        onConnect={NOOP}
        onOpenConsole={NOOP}
        signIn={{ status: "idle" }}
      />
    );

    expect(text(html)).toContain("Se connecter");
    expect(text(html)).toContain("Ouvrir la console");
  });

  it("affiche le code et l'adresse à approuver pendant l'attente", () => {
    const html = renderToStaticMarkup(
      <AccountSignInCard
        consoleUrl={CONSOLE_URL}
        onConnect={NOOP}
        onOpenConsole={NOOP}
        signIn={{
          status: "waiting",
          userCode: "WDJB-MJHT",
          verificationUri: `${CONSOLE_URL}/device`,
        }}
      />
    );

    expect(text(html)).toContain("WDJB-MJHT");
    expect(text(html)).toContain(CONSOLE_URL);
    expect(html).toContain('aria-busy="true"');
  });

  it("rend le refus et son remède tels quels", () => {
    const html = renderToStaticMarkup(
      <AccountSignInCard
        consoleUrl={CONSOLE_URL}
        onConnect={NOOP}
        onOpenConsole={NOOP}
        signIn={{
          error: {
            code: "denied",
            fix: "Relance la connexion et approuve le code affiché.",
            message: "La demande a été refusée dans le navigateur.",
          },
          status: "failed",
        }}
      />
    );

    expect(text(html)).toContain(
      "La demande a été refusée dans le navigateur."
    );
    expect(text(html)).toContain(
      "Relance la connexion et approuve le code affiché."
    );
  });
});

describe("l'identité", () => {
  it("montre le compte, l'organisation et l'empreinte de l'appareil", () => {
    const html = renderToStaticMarkup(
      <AccountIdentityCard
        account={SIGNED_IN}
        onDisconnect={NOOP}
        onRefresh={NOOP}
      />
    );

    expect(text(html)).toContain("ada@pupitre.studio");
    expect(text(html)).toContain("Atelier Ada");
    expect(text(html)).toContain("SHA256:mac");
    expect(text(html)).toContain("Se déconnecter");
  });

  it("prévient quand le trousseau n'a pas voulu garder la session", () => {
    const html = renderToStaticMarkup(
      <AccountIdentityCard
        account={{ ...SIGNED_IN, sealed: false }}
        onDisconnect={NOOP}
        onRefresh={NOOP}
      />
    );

    expect(text(html)).toContain("trousseau de cet ordinateur");
  });

  it("ne montre jamais autre chose que la moitié publique", () => {
    const html = renderToStaticMarkup(
      <AccountIdentityCard
        account={SIGNED_IN}
        onDisconnect={NOOP}
        onRefresh={NOOP}
      />
    );

    expect(html).not.toContain("PRIVATE");
    expect(html).not.toContain("Bearer");
  });
});

describe("l'enrôlement", () => {
  it("nomme le serveur de la console et la version poussée", () => {
    const html = renderToStaticMarkup(
      <OnboardingEnrollmentNote
        enrollment={{
          release: { available: true, channel: "stable", version: "1.4.0" },
          serverId: "srv-platform-1",
        }}
      />
    );

    expect(text(html)).toContain("Serveur enrôlé");
    expect(text(html)).toContain("srv-platform-1");
    expect(text(html)).toContain("pupitred 1.4.0");
  });

  it("ne montre rien quand aucun compte n'a enrôlé la machine", () => {
    expect(
      renderToStaticMarkup(<OnboardingEnrollmentNote enrollment={null} />)
    ).toBe("");
  });
});
