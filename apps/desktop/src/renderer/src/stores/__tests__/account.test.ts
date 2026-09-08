import { beforeEach, describe, expect, it } from "bun:test";
import type { AccountState, SignInProgress } from "@shared/account";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { accountOf, useAccount } from "../account";

const SIGNED_OUT: AccountState = {
  build: "production",
  checkedAt: null,
  consoleUrl: "https://app.pupitre.test/dashboard",
  device: null,
  identity: null,
  refusal: {
    code: "entitlement_required",
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
    entitlement: "valid",
    name: "Ada",
    organization: { id: "org-1", name: "Ada", slug: "ada" },
    organizations: [{ id: "org-1", name: "Ada", role: "owner", slug: "ada" }],
    role: "owner",
  },
  usage: {
    entitlement: "valid",
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
    entitlement: "valid",
    source: "cache",
    status: "granted",
    validUntil: "2026-09-11T10:00:00.000Z",
  },
};

const STALE: AccountState = {
  ...SIGNED_IN,
  refusal: {
    code: "entitlement_required",
    fix: "Reconnecte cet appareil, ou vérifie l'état du compte : https://app.pupitre.test/dashboard",
    message:
      "La console n'a pas répondu depuis plus de sept jours : le droit d'usage a expiré.",
  },
  usage: {
    consoleUrl: "https://app.pupitre.test/dashboard",
    since: "2026-09-04T10:00:00.000Z",
    status: "stale",
  },
};

describe("la lecture du compte", () => {
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
