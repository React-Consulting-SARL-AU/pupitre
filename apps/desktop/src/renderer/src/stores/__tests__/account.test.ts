import { beforeEach, describe, expect, it } from "bun:test";
import type {
  AccountResponse,
  AccountState,
  SignInProgress,
} from "@shared/account";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { accountOf, useAccount } from "../account";

const SIGNED_OUT: AccountState = {
  build: "production",
  checkedAt: null,
  consoleUrl: "https://app.pupitre.test/dashboard",
  device: null,
  identity: null,
  refusal: {
    code: "license_required",
    fix: "Connecte-toi depuis les réglages, ou ouvre la console : https://app.pupitre.test/dashboard",
    message: "Installer un serveur demande un compte Pupitre.",
  },
  sealed: true,
  usage: { consoleUrl: "https://app.pupitre.test/dashboard", status: "absent" },
};

const SIGNED_IN: AccountState = {
  ...SIGNED_OUT,
  checkedAt: "2026-09-04T10:00:00.000Z",
  refusal: null,
  device: {
    fingerprint: "SHA256:mac",
    id: "device-1",
    name: "MacBook",
    publicKey: "ssh-ed25519 AAAA",
  },
  identity: {
    email: "ada@pupitre.studio",
    license: "valid",
    licenseGrant: null,
    name: "Ada",
    organization: { id: "org-1", name: "Ada", slug: "ada" },
    organizations: [{ id: "org-1", name: "Ada", role: "owner", slug: "ada" }],
    role: "owner",
    servers: { limit: 3, used: 1 },
  },
  usage: {
    license: "valid",
    source: "platform",
    status: "granted",
    validUntil: "2026-09-11T10:00:00.000Z",
  },
};

beforeEach(() => {
  useAccount.setState({
    signIn: { status: "idle" },
    view: { status: "unknown" },
  });
});

const CACHED: AccountState = {
  ...SIGNED_IN,
  usage: {
    license: "valid",
    source: "cache",
    status: "granted",
    validUntil: "2026-09-11T10:00:00.000Z",
  },
};

const STALE: AccountState = {
  ...SIGNED_IN,
  refusal: {
    code: "license_required",
    fix: "Reconnecte cet appareil, ou vérifie l'état du compte : https://app.pupitre.test/dashboard",
    message:
      "La console n'a pas répondu depuis plus de sept jours : la licence a expiré.",
  },
  usage: {
    consoleUrl: "https://app.pupitre.test/dashboard",
    since: "2026-09-04T10:00:00.000Z",
    status: "stale",
  },
};

describe("un pont qui ne répond pas", () => {
  it("garde l'échec et ce qui a été levé, puis relit quand on le lui demande", async () => {
    stubPupitre({
      account: () => Promise.reject(new Error("keychain locked")),
    });

    await useAccount.getState().read();

    expect(useAccount.getState().view).toEqual({
      error: {
        code: "internal",
        message: "keychain locked",
        phrase: { id: "account.read.failed" },
      },
      status: "failed",
    });
    expect(accountOf(useAccount.getState().view)).toBeNull();

    stubPupitre({ account: () => Promise.resolve(SIGNED_IN) });

    await useAccount.getState().read();

    expect(accountOf(useAccount.getState().view)).toEqual(SIGNED_IN);
  });
});

describe("la lecture du compte", () => {
  it("porte la licence tel que le processus principal l'a rendue, sans la relire", async () => {
    const licensed: AccountState = {
      ...SIGNED_IN,
      identity: SIGNED_IN.identity && {
        ...SIGNED_IN.identity,
        licenseGrant: {
          current_period_end: "2027-09-25T00:00:00.000Z",
          seats: 5,
          status: "active",
        },
        servers: { limit: 8, used: 6 },
      },
    };

    stubPupitre({
      account: () => Promise.resolve(licensed),
      refreshAccount: () => Promise.resolve(SIGNED_IN),
    });

    await useAccount.getState().read();

    expect(
      accountOf(useAccount.getState().view)?.identity?.licenseGrant
    ).toEqual(licensed.identity?.licenseGrant ?? null);

    await useAccount.getState().refresh();

    expect(
      accountOf(useAccount.getState().view)?.identity?.licenseGrant
    ).toBeNull();
  });

  it("garde l'état que le processus principal a rendu", async () => {
    stubPupitre({ account: () => Promise.resolve(SIGNED_IN) });

    await useAccount.getState().read();

    expect(accountOf(useAccount.getState().view)).toEqual(SIGNED_IN);
  });

  it("part d'un état inconnu, jamais d'un refus supposé", () => {
    expect(useAccount.getState().view).toEqual({ status: "unknown" });
    expect(accountOf(useAccount.getState().view)).toBeNull();
  });

  it("ouvre l'app sur une session en cache et dit de quand date la réponse", async () => {
    stubPupitre({ account: () => Promise.resolve(CACHED) });

    await useAccount.getState().read();

    const account = accountOf(useAccount.getState().view);

    expect(account?.usage).toMatchObject({
      source: "cache",
      status: "granted",
    });
    expect(account?.checkedAt).toBe("2026-09-04T10:00:00.000Z");
    expect(account?.refusal).toBeNull();
  });

  it("garde le refus du garde tel quel au-delà des sept jours", async () => {
    stubPupitre({ account: () => Promise.resolve(STALE) });

    await useAccount.getState().read();

    expect(accountOf(useAccount.getState().view)?.refusal).toEqual(
      STALE.refusal
    );
  });

  it("garde le refus après une actualisation qui n'a rien rapporté", async () => {
    stubPupitre({
      account: () => Promise.resolve(SIGNED_IN),
      refreshAccount: () => Promise.resolve(STALE),
    });

    await useAccount.getState().read();
    await useAccount.getState().refresh();

    expect(accountOf(useAccount.getState().view)?.usage.status).toBe("stale");
  });
});

describe("la connexion", () => {
  it("affiche le code, puis passe à l'attente, puis à l'état connecté", async () => {
    const seen: string[] = [];

    stubPupitre({
      signIn: (onProgress: (progress: SignInProgress) => void) => {
        onProgress({ kind: "starting" });
        seen.push(useAccount.getState().signIn.status);

        onProgress({
          kind: "code",
          userCode: "WDJB-MJHT",
          verificationUri: "https://app.pupitre.test/auth/device",
          verificationUriComplete:
            "https://app.pupitre.test/auth/device?user_code=WDJB-MJHT",
        });
        seen.push(useAccount.getState().signIn.status);

        onProgress({ kind: "waiting" });
        seen.push(useAccount.getState().signIn.status);

        return Promise.resolve({ ok: true, result: SIGNED_IN });
      },
    });

    await useAccount.getState().connect();

    expect(seen).toEqual(["starting", "code", "waiting"]);
    expect(useAccount.getState().signIn.status).toBe("idle");
    expect(accountOf(useAccount.getState().view)?.identity?.email).toBe(
      "ada@pupitre.studio"
    );
  });

  it("garde le code affiché tant que l'approbation n'est pas venue", async () => {
    stubPupitre({
      signIn: (onProgress: (progress: SignInProgress) => void) => {
        onProgress({
          kind: "code",
          userCode: "WDJB-MJHT",
          verificationUri: "https://app.pupitre.test/auth/device",
          verificationUriComplete: "https://app.pupitre.test/auth/device",
        });
        onProgress({ kind: "waiting" });

        return new Promise(() => undefined);
      },
    });

    useAccount.getState().connect();

    await Promise.resolve();

    expect(useAccount.getState().signIn).toMatchObject({
      status: "waiting",
      userCode: "WDJB-MJHT",
    });
  });

  it("annule l'attente : le main arrête d'attendre, l'écran revient au bouton, et une connexion suivante n'est pas effacée par l'ancienne", async () => {
    let cancelled = 0;
    const answers: ((value: AccountResponse<AccountState>) => void)[] = [];

    stubPupitre({
      cancelSignIn: () => {
        cancelled += 1;
      },
      signIn: (onProgress: (progress: SignInProgress) => void) => {
        onProgress({
          kind: "code",
          userCode: "WDJB-MJHT",
          verificationUri: "https://app.pupitre.test/auth/device",
          verificationUriComplete:
            "https://app.pupitre.test/auth/device?user_code=WDJB-MJHT",
        });
        onProgress({ kind: "waiting" });

        return new Promise((resolve) => answers.push(resolve));
      },
    });

    const first = useAccount.getState().connect();

    await Promise.resolve();
    useAccount.getState().cancelSignIn();

    expect(cancelled).toBe(1);
    expect(useAccount.getState().signIn.status).toBe("idle");

    const second = useAccount.getState().connect();

    await Promise.resolve();
    answers[0]?.({
      error: { code: "cancelled", message: "refusal.signIn.cancelled" },
      ok: false,
    });
    await first;

    expect(useAccount.getState().signIn).toMatchObject({
      status: "waiting",
      verificationUri:
        "https://app.pupitre.test/auth/device?user_code=WDJB-MJHT",
    });

    answers[1]?.({ ok: true, result: SIGNED_IN });
    await second;

    expect(useAccount.getState().signIn.status).toBe("idle");
    expect(accountOf(useAccount.getState().view)?.identity?.name).toBe("Ada");
  });

  it("garde le refus de la console avec son remède", async () => {
    stubPupitre({
      signIn: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "denied",
            message: "La demande a été refusée dans le navigateur.",
            fix: "Relance la connexion et approuve le code affiché.",
          },
        }),
    });

    await useAccount.getState().connect();

    expect(useAccount.getState().signIn).toMatchObject({
      error: { fix: "Relance la connexion et approuve le code affiché." },
      status: "failed",
    });
  });
});

describe("la déconnexion", () => {
  it("revient à l'état sans compte", async () => {
    stubPupitre({
      account: () => Promise.resolve(SIGNED_IN),
      signOut: () => Promise.resolve(SIGNED_OUT),
    });

    await useAccount.getState().read();
    await useAccount.getState().disconnect();

    expect(accountOf(useAccount.getState().view)).toEqual(SIGNED_OUT);
  });
});

describe("les appareils du compte", () => {
  it("liste ce que la plateforme tient, et relit après une révocation", async () => {
    const revoked: string[] = [];
    let held = [
      {
        fingerprint: "SHA256:mac",
        id: "device-1",
        name: "MacBook",
        publicKey: "a",
      },
      {
        fingerprint: "SHA256:old",
        id: "device-2",
        name: "Vieux",
        publicKey: "b",
      },
    ];

    stubPupitre({
      accountDevices: () => Promise.resolve({ ok: true, result: held }),
      revokeDevice: (id: string) => {
        revoked.push(id);
        held = held.filter((device) => device.id !== id);

        return Promise.resolve({ ok: true, result: null });
      },
    });

    await useAccount.getState().readDevices();

    expect(useAccount.getState().devices).toMatchObject({
      devices: [{ id: "device-1" }, { id: "device-2" }],
      status: "read",
    });

    await useAccount.getState().revokeDevice("device-2");

    expect(revoked).toEqual(["device-2"]);
    expect(useAccount.getState().revoking).toBeNull();
    expect(useAccount.getState().devices).toMatchObject({
      devices: [{ id: "device-1" }],
      status: "read",
    });
  });

  it("garde le refus d'une révocation, la liste telle quelle", async () => {
    stubPupitre({
      accountDevices: () => Promise.resolve({ ok: true, result: [] }),
      revokeDevice: () =>
        Promise.resolve({
          error: { code: "bad_request", message: "refusal.device.self" },
          ok: false,
        }),
    });

    await useAccount.getState().readDevices();
    await useAccount.getState().revokeDevice("device-1");

    expect(useAccount.getState().deviceProblem).toMatchObject({
      message: "refusal.device.self",
    });
    expect(useAccount.getState().devices).toMatchObject({ status: "read" });
  });
});
