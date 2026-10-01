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

describe("the licence", () => {
  it("tells each state apart by shape", () => {
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

  it("sends an organization beyond its free servers to support, like one the platform suspends", () => {
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

  it("names the seven days of grace while the cache still holds", () => {
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

  it("says what a missing account prevents, without mentioning the build", () => {
    const html = usage({ consoleUrl: CONSOLE_URL, status: "absent" });

    expect(text(html)).toContain("Aucun compte connecté");
    expect(text(html)).toContain("ni mis à jour tant qu'aucun compte");
    expect(text(html)).not.toContain("build de production");
  });
});

describe("the sign-in", () => {
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

  it("offers to sign in and open the console", () => {
    const html = card({ status: "idle" });

    expect(text(html)).toContain("Se connecter");
    expect(text(html)).toContain("Ouvrir la console");
  });

  it("shows the code and the address to approve while waiting", () => {
    const html = card({
      status: "waiting",
      userCode: "WDJB-MJHT",
      verificationUri: `${CONSOLE_URL}/device`,
    });

    expect(text(html)).toContain("WDJB-MJHT");
    expect(text(html)).toContain(CONSOLE_URL);
    expect(html).toContain('aria-busy="true"');
  });

  it("walks through the three steps of the approval while waiting", () => {
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

  it("names the code verification page, not the console address", () => {
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

  it("reopens the browser on the code address, and lets the wait be cancelled", async () => {
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

  it("renders the refusal and its fix as they come", () => {
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

describe("the account screen", () => {
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

  it("offers sign-in and settings, and nothing about a machine", () => {
    const html = gate(SIGNED_OUT);

    expect(text(html)).toContain("Connectez-vous pour ouvrir Pupitre");
    expect(text(html)).toContain("Se connecter");
    expect(text(html)).toContain("Ouvrir les réglages");
    expect(text(html)).not.toContain("Tableau de bord");
    expect(text(html)).not.toContain("Terminaux");
  });

  it("does not tell someone without an account that they need one: the sign-in card says it", () => {
    const html = gate(SIGNED_OUT);

    expect(text(html)).not.toContain("Installer un serveur demande un compte");
    expect(text(html)).not.toContain("Aucun compte connecté");
    expect(text(html)).not.toContain("tant qu'aucun compte n'est connecté");
  });

  it("names the console being signed in to", () => {
    expect(text(gate(SIGNED_OUT))).toContain("app.pupitre.test");
  });

  it("offers a development build to continue without an account", () => {
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

  it("never offers it to a packaged build", () => {
    expect(text(gate(SIGNED_OUT))).not.toContain("Continuer sans compte");
  });

  it("says since when the console has not answered beyond the seven days", () => {
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

  it("tells someone beyond the free servers that a licence is required, once, without asking them to sign in again", () => {
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

  it("names the suspension once, with the gesture that settles it", () => {
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

  it("does not offer a development build to continue without an account when the licence is what is missing", () => {
    const html = text(gate({ ...UNLICENSED, build: "development" }));

    expect(html).not.toContain("Continuer sans compte");
  });
});

describe("the identity", () => {
  it("shows the account and the organization, and leaves the device to the device list", () => {
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

  it("warns when the keychain refused to keep the session", () => {
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

  it("never shows anything but the public half", () => {
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

describe("the enrolment", () => {
  it("names the console's server and the pushed version", () => {
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

  it("shows nothing when no account has enrolled the machine", () => {
    expect(
      renderToStaticMarkup(<OnboardingEnrollmentNote enrollment={null} />)
    ).toBe("");
  });
});

describe("the licence under the account", () => {
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

  it("counts the servers in use and states the free-server rule", () => {
    const html = text(card({ limit: 3, used: 1 }));

    expect(html).toContain("1 sur 3 serveurs utilisés");
    expect(html).toContain(
      "Gratuit jusqu'à 3 serveurs par organisation ; une licence est requise au-delà. Écrivez à support@pupitre.studio."
    );
    expect(html).not.toContain("Écrire au support");
    expect(html).not.toMatch(/abonnement|essai|offre/i);
  });

  it("offers to write to support once the free servers are used up", () => {
    expect(text(card({ limit: 3, used: 3 }))).toContain("Écrire au support");
  });

  it("says what a licence adds and until when", () => {
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

  it("keeps Stripe's own word for a status it does not name", () => {
    const html = card(
      { limit: 3, used: 1 },
      { current_period_end: null, seats: 0, status: "incomplete_expired" }
    );

    expect(text(html)).toContain("incomplete_expired");
    expect(text(html)).not.toContain("valable jusqu'au");
  });
});
