import { beforeEach, describe, expect, it } from "bun:test";
import type { Manifest } from "@pupitre/shared/catalog";
import { NO_CONNECTIONS } from "@shared/connections";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { forgetScope, useConnections } from "../connections";

const CONNECTED = {
  ...NO_CONNECTIONS,
  github: {
    account: { id: "42", name: "ada" },
    sealed: true,
    status: "connected" as const,
  },
};

function manifest(id: string, connection?: Manifest["connection"]): Manifest {
  return {
    category: "tool",
    connection,
    description: id,
    fields: [],
    id: id as Manifest["id"],
    name: id,
    resources: { disk_gb: 0, ram_mb: 0 },
    version: "1",
  } as unknown as Manifest;
}

beforeEach(() => {
  useConnections.setState({
    busy: null,
    choices: {},
    health: {},
    problems: {},
    state: CONNECTED,
  });
});

describe("le refus d'un jeton à la connexion", () => {
  /** Two forms on one screen: a refusal belongs under the one that sent the token. */
  it("reste sous le compte qui l'a reçu, et sous lui seul", async () => {
    stubPupitre({
      connectAccount: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "bad_request",
            message: "refusal.connection.revoked",
            phrase: {
              id: "refusal.connection.revoked",
              values: { kind: "cloudflare", reason: "no account" },
            },
          },
        }),
    });

    expect(await useConnections.getState().connect("cloudflare", "cf_x")).toBe(
      false
    );

    const { busy, problems } = useConnections.getState();

    expect(busy).toBeNull();
    expect(problems.cloudflare?.phrase?.values).toEqual({
      kind: "cloudflare",
      reason: "no account",
    });
    expect(problems.github).toBeUndefined();
    expect(problems.wrangler).toBeUndefined();
  });

  it("s'efface quand le même compte est retenté, pas quand un autre l'est", async () => {
    const refused = {
      code: "bad_request" as const,
      message: "refusal.connection.revoked",
    };

    useConnections.setState({ problems: { cloudflare: refused } });
    stubPupitre({
      connectionZones: () => Promise.resolve({ ok: true, result: [] }),
      connectAccount: (kind) =>
        Promise.resolve({
          ok: true,
          result: {
            state: {
              ...CONNECTED,
              [kind]: {
                account: { id: "1", name: "flymate" },
                sealed: true,
                status: "connected",
              },
            },
            status: "connected",
          },
        }),
    });

    await useConnections.getState().connect("wrangler", "cf_w");

    expect(useConnections.getState().problems.cloudflare).toEqual(refused);
    expect(useConnections.getState().state.wrangler.status).toBe("connected");

    await useConnections.getState().connect("cloudflare", "cf_ok");

    expect(useConnections.getState().problems.cloudflare).toBeUndefined();
  });

  it("n'occupe que le compte en cours d'envoi", async () => {
    const seen: unknown[] = [];

    stubPupitre({
      connectAccount: () => {
        seen.push(useConnections.getState().busy);

        return Promise.resolve({
          ok: true,
          result: { state: CONNECTED, status: "connected" },
        });
      },
    });

    await useConnections.getState().connect("neon", "neon_x");

    expect(seen).toEqual(["neon"]);
    expect(useConnections.getState().busy).toBeNull();
  });
});

describe("un jeton qui ouvre plusieurs comptes", () => {
  const ACCOUNTS = [
    { id: "acc-1", name: "Flymate" },
    { id: "acc-2", name: "Atelier" },
  ];

  /** Nothing is kept until the reader names the account: the choice sits under the card, not in the keychain. */
  it("n'est pas connecté tant que le compte n'est pas choisi", async () => {
    stubPupitre({
      connectAccount: () =>
        Promise.resolve({
          ok: true,
          result: { accounts: ACCOUNTS, status: "choose" },
        }),
    });

    expect(await useConnections.getState().connect("wrangler", "cf_x")).toBe(
      false
    );

    const { choices, state, busy } = useConnections.getState();

    expect(choices.wrangler).toEqual(ACCOUNTS);
    expect(choices.cloudflare).toBeUndefined();
    expect(state.wrangler).toEqual({ status: "absent" });
    expect(busy).toBeNull();
  });

  it("renvoie le jeton avec le compte choisi, puis oublie la question", async () => {
    const sent: unknown[] = [];

    useConnections.setState({ choices: { wrangler: ACCOUNTS } });
    stubPupitre({
      connectionZones: () => Promise.resolve({ ok: true, result: [] }),
      connectAccount: (_kind, _token, accountId) => {
        sent.push(accountId);

        return Promise.resolve({
          ok: true,
          result: { state: CONNECTED, status: "connected" },
        });
      },
    });

    expect(
      await useConnections.getState().connect("wrangler", "cf_x", "acc-2")
    ).toBe(true);
    expect(sent).toEqual(["acc-2"]);
    expect(useConnections.getState().choices.wrangler).toBeUndefined();
  });

  it("laisse tomber la question quand le jeton est retapé", () => {
    useConnections.setState({
      choices: { cloudflare: ACCOUNTS, wrangler: ACCOUNTS },
    });

    useConnections.getState().dropChoice("wrangler");

    expect(useConnections.getState().choices).toEqual({
      cloudflare: ACCOUNTS,
    });
  });
});

describe("la santé d'un jeton", () => {
  it("dit comme quel compte le fournisseur répond, et le renomme", async () => {
    stubPupitre({
      verifyAccount: () =>
        Promise.resolve({
          ok: true,
          result: {
            account: { id: "42", name: "ada-renamed" },
            status: "answered",
          },
        }),
    });

    await useConnections.getState().verify("github");

    expect(useConnections.getState().health.github).toMatchObject({
      account: "ada-renamed",
      status: "answered",
    });
    expect(useConnections.getState().state.github).toMatchObject({
      account: { name: "ada-renamed" },
      status: "connected",
    });
  });

  it("garde le refus d'un jeton révoqué, avec son remède", async () => {
    stubPupitre({
      verifyAccount: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            message: "refusal.connection.revoked",
            phrase: { id: "refusal.connection.revoked" },
          },
          ok: false,
        }),
    });

    await useConnections.getState().verify("github");

    expect(useConnections.getState().health.github).toMatchObject({
      error: { message: "refusal.connection.revoked" },
      status: "refused",
    });
  });

  it("dit qu'un fournisseur muet ne peut pas être interrogé", async () => {
    stubPupitre({
      verifyAccount: () =>
        Promise.resolve({ ok: true, result: { status: "unaskable" } }),
    });

    await useConnections.getState().verify("1password");

    expect(useConnections.getState().health["1password"]).toEqual({
      status: "unaskable",
    });
  });

  it("oublie la santé avec le compte", async () => {
    useConnections.setState({
      health: { github: { status: "unaskable" } },
    });
    stubPupitre({ forgetAccount: () => Promise.resolve(NO_CONNECTIONS) });

    await useConnections.getState().forget("github");

    expect(useConnections.getState().health.github).toBeUndefined();
    expect(useConnections.getState().state.github).toEqual({
      status: "absent",
    });
  });
});

describe("le rayon d'action d'un oubli", () => {
  const manifests = [
    manifest("tool.github", "github"),
    manifest("tool.neon", "neon"),
    manifest("runtime.node"),
  ];

  it("nomme les modules installés qui déclarent ce compte", () => {
    expect(
      forgetScope("github", ["tool.github", "runtime.node"], manifests)
    ).toEqual({ known: true, modules: ["tool.github"] });
  });

  it("ne nomme pas un module qui n'est pas installé", () => {
    expect(forgetScope("neon", ["tool.github"], manifests)).toEqual({
      known: true,
      modules: [],
    });
  });

  it("dit qu'il ne sait pas quand le catalogue n'a pas été lu", () => {
    expect(forgetScope("github", ["tool.github"], null)).toEqual({
      known: false,
      modules: [],
    });
  });
});
