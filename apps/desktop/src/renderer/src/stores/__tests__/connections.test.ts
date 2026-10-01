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

describe("a token refused at connection", () => {
  // Two forms share the screen, so a refusal belongs under the one that sent the token.
  it("stays under the account that received it, and only that one", async () => {
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

  it("clears when the same account is retried, not when another one is", async () => {
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
                account: { id: "1", name: "flyleaf" },
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

  it("only occupies the account being sent", async () => {
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

describe("a token that opens several accounts", () => {
  const ACCOUNTS = [
    { id: "acc-1", name: "Flyleaf" },
    { id: "acc-2", name: "Atelier" },
  ];

  it("is not connected until the account is chosen", async () => {
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

  it("resends the token with the chosen account, then forgets the question", async () => {
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

  it("drops the question when the token is retyped", () => {
    useConnections.setState({
      choices: { cloudflare: ACCOUNTS, wrangler: ACCOUNTS },
    });

    useConnections.getState().dropChoice("wrangler");

    expect(useConnections.getState().choices).toEqual({
      cloudflare: ACCOUNTS,
    });
  });
});

describe("the health of a token", () => {
  it("says which account the provider answers as, and renames it", async () => {
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

  it("keeps the refusal of a revoked token, with its fix", async () => {
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

  it("says a silent provider cannot be queried", async () => {
    stubPupitre({
      verifyAccount: () =>
        Promise.resolve({ ok: true, result: { status: "unaskable" } }),
    });

    await useConnections.getState().verify("1password");

    expect(useConnections.getState().health["1password"]).toEqual({
      status: "unaskable",
    });
  });

  it("forgets the health along with the account", async () => {
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

describe("the blast radius of forgetting an account", () => {
  const manifests = [
    manifest("tool.github", "github"),
    manifest("tool.neon", "neon"),
    manifest("runtime.node"),
  ];

  it("names the installed modules that declare this account", () => {
    expect(
      forgetScope("github", ["tool.github", "runtime.node"], manifests)
    ).toEqual({ known: true, modules: ["tool.github"] });
  });

  it("does not name a module that is not installed", () => {
    expect(forgetScope("neon", ["tool.github"], manifests)).toEqual({
      known: true,
      modules: [],
    });
  });

  it("says it does not know when the catalogue has not been read", () => {
    expect(forgetScope("github", ["tool.github"], null)).toEqual({
      known: false,
      modules: [],
    });
  });
});
