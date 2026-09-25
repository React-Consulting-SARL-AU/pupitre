import { describe, expect, it } from "bun:test";
import type {
  AccountIdentity,
  AccountState,
  UsageRight,
} from "@shared/account";
import { renderToStaticMarkup } from "react-dom/server";
import { mount } from "../../__tests__/dom";
import type { SignInState } from "../../stores/account";
import { AccountGateScreen } from "../account/account-gate-screen";
import { AccountIdentityCard } from "../account/account-identity-card";
import { AccountSignInCard } from "../account/account-sign-in-card";
import {
  AccountSubscriptionCard,
  billingUrlOf,
} from "../account/account-subscription-card";
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

const ADA: AccountIdentity = {
  email: "ada@pupitre.studio",
  entitlement: "valid",
  name: "Ada Lovelace",
  organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
  organizations: [
    { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
  ],
  role: "owner",
  subscription: null,
};

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
  identity: ADA,
  refusal: null,
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
      usage({ consoleUrl: CONSOLE_URL, status: "unsubscribed" }),
    ].map((html) => html.match(/data-shape="([a-z]+)"/)?.[1]);

    expect(shapes).toEqual([
      "filled",
      "ringed",
      "empty",
      "empty",
      "struck",
      "struck",
      "empty",
    ]);
  });

  it("envoie choisir une offre à l'organisation qui n'en a pas, et gérer la sienne à celle qui est suspendue", () => {
    const unsubscribed = text(
      renderToStaticMarkup(
        <AccountUsageNotice
          checkedAt={null}
          onOpenConsole={NOOP}
          usage={{ consoleUrl: CONSOLE_URL, status: "unsubscribed" }}
        />
      )
    );
    const suspended = text(
      renderToStaticMarkup(
        <AccountUsageNotice
          checkedAt={null}
          onOpenConsole={NOOP}
          usage={{ consoleUrl: CONSOLE_URL, status: "suspended" }}
        />
      )
    );

    expect(unsubscribed).toContain("Aucun abonnement");
    expect(unsubscribed).toContain("Choisir une offre");
    expect(unsubscribed).not.toContain("suspendu");
    expect(suspended).toContain("Abonnement suspendu");
    expect(suspended).toContain("Gérer l'abonnement");
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

    expect(text(html)).toContain("sept jours sans connexion");
    expect(html).toContain('data-usage="granted"');
  });

  it("dit ce qu'un compte absent empêche, sans parler du build", () => {
    const html = usage({ consoleUrl: CONSOLE_URL, status: "absent" });

    expect(text(html)).toContain("Aucun compte connecté");
    expect(text(html)).toContain("ni mis à jour tant qu'aucun compte");
    expect(text(html)).not.toContain("build de production");
  });
});

describe("la connexion", () => {
  const card = (signIn: SignInState): string =>
    renderToStaticMarkup(
      <AccountSignInCard
        consoleUrl={CONSOLE_URL}
        onCancel={NOOP}
        onConnect={NOOP}
        onOpenUrl={NOOP}
        signIn={signIn}
      />
    );

  it("propose de se connecter et d'ouvrir la console", () => {
    const html = card({ status: "idle" });

    expect(text(html)).toContain("Se connecter");
    expect(text(html)).toContain("Ouvrir la console");
  });

  it("affiche le code et l'adresse à approuver pendant l'attente", () => {
    const html = card({
      status: "waiting",
      userCode: "WDJB-MJHT",
      verificationUri: `${CONSOLE_URL}/device`,
    });

    expect(text(html)).toContain("WDJB-MJHT");
    expect(text(html)).toContain(CONSOLE_URL);
    expect(html).toContain('aria-busy="true"');
  });

  it("déroule les trois pas de l'approbation pendant l'attente", () => {
    const html = card({
      status: "code",
      userCode: "WDJB-MJHT",
      verificationUri: `${CONSOLE_URL}/device`,
    });

    expect(text(html)).toContain("Le navigateur s'est ouvert");
    expect(text(html)).toContain("approuvez-le");
    expect(text(html)).toContain("dès que la console a confirmé");
  });

  it("rouvre le navigateur sur l'adresse du code, et laisse annuler l'attente", async () => {
    const opened: string[] = [];
    const cancelled: string[] = [];
    const view = await mount(
      <AccountSignInCard
        consoleUrl={CONSOLE_URL}
        onCancel={() => cancelled.push("cancel")}
        onConnect={NOOP}
        onOpenUrl={(url) => opened.push(url)}
        signIn={{
          status: "waiting",
          userCode: "WDJB-MJHT",
          verificationUri: `${CONSOLE_URL}/device?user_code=WDJB-MJHT`,
        }}
      />
    );
    const button = (label: string) =>
      [...view.container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === label
      ) ?? null;

    await view.click(button("Rouvrir le navigateur"));
    await view.click(button("Annuler la connexion"));

    expect(opened).toEqual([`${CONSOLE_URL}/device?user_code=WDJB-MJHT`]);
    expect(cancelled).toEqual(["cancel"]);

    view.unmount();
  });

  it("rend le refus et son remède tels quels", () => {
    const html = card({
      error: {
        code: "denied",
        fix: "Relance la connexion et approuve le code affiché.",
        message: "La demande a été refusée dans le navigateur.",
      },
      status: "failed",
    });

    expect(text(html)).toContain(
      "La demande a été refusée dans le navigateur."
    );
    expect(text(html)).toContain(
      "Relance la connexion et approuve le code affiché."
    );
  });
});

describe("l'écran de compte", () => {
  const gate = (account: AccountState): string =>
    renderToStaticMarkup(
      <AccountGateScreen account={account} onSettings={NOOP} />
    );

  const SIGNED_OUT: AccountState = {
    ...SIGNED_IN,
    checkedAt: null,
    device: null,
    identity: null,
    refusal: {
      code: "entitlement_required",
      fix: `Connecte-toi depuis les réglages, ou ouvre la console : ${CONSOLE_URL}`,
      message: "Installer un serveur demande un compte Pupitre.",
    },
    usage: { consoleUrl: CONSOLE_URL, status: "absent" },
  };

  it("propose la connexion et les réglages, et rien d'une machine", () => {
    const html = gate(SIGNED_OUT);

    expect(text(html)).toContain("Connectez-vous pour ouvrir Pupitre");
    expect(text(html)).toContain("Se connecter");
    expect(text(html)).toContain("Ouvrir les réglages");
    expect(text(html)).not.toContain("Tableau de bord");
    expect(text(html)).not.toContain("Terminaux");
  });

  it("ne répète pas à qui n'a pas de compte qu'il lui en faut un : la carte de connexion le dit", () => {
    const html = gate(SIGNED_OUT);

    expect(text(html)).not.toContain("Installer un serveur demande un compte");
    expect(text(html)).not.toContain("Aucun compte connecté");
    expect(text(html)).not.toContain("tant qu'aucun compte n'est connecté");
  });

  it("nomme la console à laquelle on se connecte", () => {
    expect(text(gate(SIGNED_OUT))).toContain("app.pupitre.test");
  });

  it("offre à un build de développement de continuer sans compte", () => {
    const html = gate({
      ...SIGNED_OUT,
      build: "development",
      refusal: null,
      usage: {
        entitlement: "none",
        source: "development",
        status: "granted",
        validUntil: null,
      },
    });

    expect(text(html)).toContain("Continuer sans compte");
    expect(text(html)).toContain("Se connecter");
  });

  it("ne l'offre jamais à un build packagé", () => {
    expect(text(gate(SIGNED_OUT))).not.toContain("Continuer sans compte");
  });

  it("dit depuis quand la console n'a pas répondu au-delà des sept jours", () => {
    const html = gate({
      ...SIGNED_OUT,
      checkedAt: "2026-08-01T10:00:00.000Z",
      refusal: {
        code: "entitlement_required",
        fix: `Reconnecte cet appareil, ou vérifie l'état du compte : ${CONSOLE_URL}`,
        message:
          "La console n'a pas répondu depuis plus de sept jours : le droit d'usage a expiré.",
      },
      usage: {
        consoleUrl: CONSOLE_URL,
        since: "2026-08-01T10:00:00.000Z",
        status: "stale",
      },
    });

    expect(text(html)).toContain("Vérification expirée");
    expect(text(html)).toContain("Dernière vérification");
    expect(text(html)).toContain("Ouvrir la console");
    expect(text(html)).not.toContain("le droit d'usage a expiré");
  });

  const UNSUBSCRIBED: AccountState = {
    ...SIGNED_IN,
    identity: { ...ADA, entitlement: "suspended" },
    refusal: {
      code: "entitlement_required",
      fix: `Choisissez une offre dans la console : ${CONSOLE_URL}`,
      message: "Cette organisation n'a pas d'abonnement.",
    },
    usage: { consoleUrl: CONSOLE_URL, status: "unsubscribed" },
  };

  it("dit à qui est connecté sans offre laquelle choisir, une seule fois, sans lui redemander de se connecter", () => {
    const html = text(gate(UNSUBSCRIBED));

    expect(html).toContain("Choisissez une offre pour ouvrir Pupitre");
    expect(html).toContain("Atelier Ada n'a pas d'abonnement");
    expect(html).toContain("Choisir une offre");
    expect(html).toContain("Actualiser");
    expect(html).toContain("ada@pupitre.studio");
    expect(html).not.toContain("Se connecter");
    expect(html).not.toContain("suspendu");
    expect(html.match(/pas d'abonnement/g)).toHaveLength(1);
  });

  it("nomme la suspension une seule fois, avec le geste qui la règle", () => {
    const html = text(
      gate({
        ...UNSUBSCRIBED,
        identity: {
          ...ADA,
          entitlement: "suspended",
          subscription: {
            current_period_end: "2026-08-31T00:00:00.000Z",
            servers: { limit: 1, used: 1 },
            status: "canceled",
            trial_ends_at: null,
          },
        },
        refusal: {
          code: "server_suspended",
          fix: `Régularisez l'abonnement dans la console : ${CONSOLE_URL}`,
          message: "L'abonnement de cette organisation est suspendu.",
        },
        usage: { consoleUrl: CONSOLE_URL, status: "suspended" },
      })
    );

    expect(html).toContain("Abonnement suspendu");
    expect(html).toContain("Gérer l'abonnement");
    expect(html).not.toContain("Se connecter");
    expect(html.match(/suspendu/g)).toHaveLength(2);
  });

  it("ne propose pas à un build de développement de continuer sans compte quand c'est l'offre qui manque", () => {
    const html = text(gate({ ...UNSUBSCRIBED, build: "development" }));

    expect(html).not.toContain("Continuer sans compte");
  });
});

describe("l'identité", () => {
  it("montre le compte et l'organisation, et laisse l'appareil à la liste des appareils", () => {
    const html = renderToStaticMarkup(
      <AccountIdentityCard
        account={SIGNED_IN}
        onDisconnect={NOOP}
        onRefresh={NOOP}
      />
    );

    expect(text(html)).toContain("ada@pupitre.studio");
    expect(text(html)).toContain("Atelier Ada");
    expect(text(html)).toContain("Propriétaire");
    expect(text(html)).not.toContain("owner");
    expect(text(html)).not.toContain("SHA256:mac");
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

    expect(text(html)).toContain("pas de trousseau système");
    expect(text(html)).toContain("GNOME Keyring ou KWallet");
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

    expect(text(html)).toContain("Serveur déclaré");
    expect(text(html)).toContain("srv-platform-1");
    expect(text(html)).toContain("pupitred 1.4.0");
  });

  it("ne montre rien quand aucun compte n'a enrôlé la machine", () => {
    expect(
      renderToStaticMarkup(<OnboardingEnrollmentNote enrollment={null} />)
    ).toBe("");
  });
});

describe("l'abonnement sous le compte", () => {
  const NOW = new Date("2026-09-11T10:00:00.000Z");

  function card(
    subscription: Parameters<typeof AccountSubscriptionCard>[0]["subscription"]
  ): string {
    return renderToStaticMarkup(
      <AccountSubscriptionCard
        consoleUrl={CONSOLE_URL}
        now={NOW}
        onOpenConsole={NOOP}
        subscription={subscription}
      />
    );
  }

  it("compte les jours d'un essai, et les sièges occupés", () => {
    const html = card({
      current_period_end: "2026-09-16T09:00:00.000Z",
      servers: { limit: 2, used: 1 },
      status: "trialing",
      trial_ends_at: "2026-09-16T09:00:00.000Z",
    });

    expect(text(html)).toContain("Essai en cours");
    expect(text(html)).toContain("5 jours restants");
    expect(text(html)).toContain("1 sièges sur 2 occupés");
    expect(text(html)).toContain("Gérer l'abonnement");
    expect(html).toContain('data-trial-tone="ok"');
    expect(html).toContain('data-shape="breathing"');
  });

  it("passe en avertissement sous trois jours, avec le remède", () => {
    const html = card({
      current_period_end: "2026-09-13T09:00:00.000Z",
      servers: { limit: 2, used: 2 },
      status: "trialing",
      trial_ends_at: "2026-09-13T09:00:00.000Z",
    });

    expect(text(html)).toContain("2 jours restants");
    expect(text(html)).toContain("Choisissez une offre dans la console");
    expect(html).toContain('data-trial-tone="warn"');
    expect(html).toContain("text-warn");
  });

  it("dit la date de renouvellement d'un abonnement payé, sans compter de jours", () => {
    const html = card({
      current_period_end: "2026-10-01T00:00:00.000Z",
      servers: { limit: 3, used: 1 },
      status: "active",
      trial_ends_at: null,
    });

    expect(text(html)).toContain("Abonnement actif");
    expect(text(html)).toContain("Renouvellement le");
    expect(text(html)).not.toContain("restant");
    expect(html).not.toContain("data-trial-tone");
    expect(html).toContain('data-shape="filled"');
  });

  it("garde le mot de Stripe pour un statut qu'elle ne nomme pas", () => {
    const html = card({
      current_period_end: null,
      servers: { limit: 1, used: 0 },
      status: "incomplete_expired",
      trial_ends_at: null,
    });

    expect(text(html)).toContain("incomplete_expired");
    expect(text(html)).not.toContain("Renouvellement");
  });

  it("envoie à la facturation de la console, sous l'adresse du compte", () => {
    expect(billingUrlOf("https://app.pupitre.test/dashboard")).toBe(
      "https://app.pupitre.test/dashboard/billing"
    );
  });
});
