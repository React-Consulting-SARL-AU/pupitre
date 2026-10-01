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
import { AccountLicenseCard } from "../account/account-license-card";
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

const ADA: AccountIdentity = {
  email: "ada@pupitre.studio",
  license: "valid",
  licenseGrant: null,
  name: "Ada Lovelace",
  organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
  organizations: [
    { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
  ],
  role: "owner",
  servers: { limit: 3, used: 1 },
};

const OVER_FREE = { limit: 3, used: 4 };

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
    license: "valid",
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

describe("la licence", () => {
  it("distingue chaque état par une forme", () => {
    const shapes = [
      usage({
        license: "valid",
        source: "platform",
        status: "granted",
        validUntil: null,
      }),
      usage({
        license: "valid",
        source: "cache",
        status: "granted",
        validUntil: null,
      }),
      usage({
        license: "none",
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
      usage({
        consoleUrl: CONSOLE_URL,
        servers: OVER_FREE,
        status: "unlicensed",
      }),
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

  it("envoie au support l'organisation au-delà de ses serveurs gratuits comme celle que la plateforme suspend", () => {
    const unlicensed = text(
      renderToStaticMarkup(
        <AccountUsageNotice
          checkedAt={null}
          onOpenConsole={NOOP}
          usage={{
            consoleUrl: CONSOLE_URL,
            servers: OVER_FREE,
            status: "unlicensed",
          }}
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

    expect(unlicensed).toContain("Licence requise");
    expect(unlicensed).toContain("4 serveurs pour 3 gratuits");
    expect(unlicensed).toContain("support@pupitre.studio");
    expect(unlicensed).toContain("Écrire au support");
    expect(unlicensed).not.toContain("suspendu");
    expect(unlicensed).not.toContain("Ouvrir la console");
    expect(suspended).toContain("Organisation suspendue");
    expect(suspended).toContain("Écrire au support");
    expect(`${unlicensed} ${suspended}`).not.toMatch(/abonnement|offre/i);
  });

  it("nomme les sept jours de tolérance quand le cache tient encore", () => {
    const html = usage(
      {
        license: "valid",
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

    expect(text(html)).toContain(
      `Le navigateur s'est ouvert sur ${CONSOLE_URL}/device.`
    );
    expect(text(html)).toContain("approuvez-le");
    expect(text(html)).toContain("dès que la console a confirmé");
  });

  it("nomme la page de vérification du code, pas l'adresse de la console", () => {
    const html = card({
      status: "waiting",
      userCode: "WDJB-MJHT",
      verificationUri: "https://app.pupitre.test/device?user_code=WDJB-MJHT",
    });

    expect(text(html)).toContain(
      "Le navigateur s'est ouvert sur https://app.pupitre.test/device?user_code=WDJB-MJHT."
    );
    expect(text(html)).not.toContain(CONSOLE_URL);
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
      code: "license_required",
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
        license: "none",
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
        code: "license_required",
        fix: `Reconnecte cet appareil, ou vérifie l'état du compte : ${CONSOLE_URL}`,
        message:
          "La console n'a pas répondu depuis plus de sept jours : la licence a expiré.",
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
    expect(text(html)).not.toContain("la licence a expiré");
  });

  const UNLICENSED: AccountState = {
    ...SIGNED_IN,
    identity: { ...ADA, license: "suspended", servers: OVER_FREE },
    refusal: {
      code: "license_required",
      fix: "Pupitre est gratuit jusqu'à 3 serveurs par organisation : retirez un serveur, ou écrivez à support@pupitre.studio pour une licence.",
      message:
        "Licence requise : cette organisation a 4 serveurs, dont 3 gratuits.",
    },
    usage: {
      consoleUrl: CONSOLE_URL,
      servers: OVER_FREE,
      status: "unlicensed",
    },
  };

  it("dit à qui dépasse les serveurs gratuits qu'une licence est requise, une seule fois, sans lui redemander de se connecter", () => {
    const html = text(gate(UNLICENSED));

    expect(html).toContain("Licence requise");
    expect(html).toContain(
      "Atelier Ada a 4 serveurs : Pupitre est gratuit jusqu'à 3 serveurs"
    );
    expect(html).toContain("support@pupitre.studio");
    expect(html).toContain("Écrire au support");
    expect(html).toContain("Actualiser");
    expect(html).toContain("ada@pupitre.studio");
    expect(html).not.toContain("Se connecter");
    expect(html).not.toContain("suspendu");
    expect(html.match(/Licence requise/g)).toHaveLength(1);
    expect(html).not.toMatch(/abonnement|offre|essai/i);
  });

  it("nomme la suspension une seule fois, avec le geste qui la règle", () => {
    const html = text(
      gate({
        ...UNLICENSED,
        identity: { ...ADA, license: "suspended" },
        refusal: {
          code: "server_suspended",
          fix: "Écrivez à support@pupitre.studio pour faire rétablir l'organisation.",
          message: "La plateforme a suspendu cette organisation.",
        },
        usage: { consoleUrl: CONSOLE_URL, status: "suspended" },
      })
    );

    expect(html).toContain("Organisation suspendue");
    expect(html).toContain("Écrire au support");
    expect(html).not.toContain("Se connecter");
    expect(html.match(/suspendu/g)).toHaveLength(2);
  });

  it("ne propose pas à un build de développement de continuer sans compte quand c'est la licence qui manque", () => {
    const html = text(gate({ ...UNLICENSED, build: "development" }));

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

describe("la licence sous le compte", () => {
  function card(
    servers: Parameters<typeof AccountLicenseCard>[0]["servers"],
    grant: Parameters<typeof AccountLicenseCard>[0]["grant"] = null
  ): string {
    return renderToStaticMarkup(
      <AccountLicenseCard
        grant={grant}
        onContactSupport={NOOP}
        servers={servers}
      />
    );
  }

  it("compte les serveurs utilisés et dit la règle des serveurs gratuits", () => {
    const html = text(card({ limit: 3, used: 1 }));

    expect(html).toContain("1 sur 3 serveurs utilisés");
    expect(html).toContain(
      "Gratuit jusqu'à 3 serveurs par organisation ; une licence est requise au-delà. Écrivez à support@pupitre.studio."
    );
    expect(html).not.toContain("Écrire au support");
    expect(html).not.toMatch(/abonnement|essai|offre/i);
  });

  it("propose d'écrire au support une fois les serveurs gratuits pris", () => {
    expect(text(card({ limit: 3, used: 3 }))).toContain("Écrire au support");
  });

  it("dit ce qu'une licence ajoute et jusqu'à quand", () => {
    const html = card(
      { limit: 8, used: 6 },
      {
        current_period_end: "2027-10-01T00:00:00.000Z",
        seats: 5,
        status: "active",
      }
    );

    expect(text(html)).toContain("Licence active");
    expect(text(html)).toContain("5 serveurs ajoutés aux gratuits");
    expect(text(html)).toContain("Licence valable jusqu'au");
    expect(html).toContain('data-shape="filled"');
  });

  it("garde le mot de Stripe pour un statut qu'elle ne nomme pas", () => {
    const html = card(
      { limit: 3, used: 1 },
      { current_period_end: null, seats: 0, status: "incomplete_expired" }
    );

    expect(text(html)).toContain("incomplete_expired");
    expect(text(html)).not.toContain("valable jusqu'au");
  });
});
