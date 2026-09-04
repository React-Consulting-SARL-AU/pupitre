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
  sealed: true,
  usage: { consoleUrl: "https://app.pupitre.test/dashboard", status: "absent" },
};

const SIGNED_IN: AccountState = {
  ...SIGNED_OUT,
  checkedAt: "2026-09-04T10:00:00.000Z",
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

describe("la lecture du compte", () => {
  it("garde l'état que le processus principal a rendu", async () => {
    stubPupitre({ account: () => Promise.resolve(SIGNED_IN) });

    await useAccount.getState().read();

    expect(accountOf(useAccount.getState().view)).toEqual(SIGNED_IN);
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

  it("garde le refus de la plateforme avec son remède", async () => {
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
