import { describe, expect, it } from "bun:test";
import {
  accountsOfToken,
  checkToken,
  chosenAccount,
  TokenError,
} from "../account-tokens";

/**
 * What a token opens, asked of the provider from the laptop.
 *
 * The point of asking is that a bad token is caught at the fifth second rather
 * than at the eighth step, on a machine the client has stopped watching. What
 * is watched here: the account comes back named, a refusal carries the
 * provider's own words and never the token, and the one provider that answers
 * nothing says so instead of guessing.
 */

function answering(
  body: unknown,
  status = 200
): { fetcher: typeof fetch; seen: { url: string; token: string }[] } {
  const seen: { url: string; token: string }[] = [];

  const fetcher = ((url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;

    seen.push({ token: headers.authorization ?? "", url: String(url) });

    return Promise.resolve({
      json: () => Promise.resolve(body),
      ok: status < 400,
      status,
    } as Response);
  }) as unknown as typeof fetch;

  return { fetcher, seen };
}

describe("ce qu'un jeton ouvre", () => {
  it("nomme le compte GitHub, sans que le jeton reparte ailleurs", async () => {
    const { fetcher, seen } = answering({ id: 42, login: "ada" });

    const accounts = await accountsOfToken("github", "ghp_de_test", fetcher);

    expect(accounts).toEqual([{ id: "42", name: "ada" }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.github.com/user");
    expect(seen[0]?.token).toBe("Bearer ghp_de_test");
  });

  it("nomme le compte Neon par son nom, sinon par son adresse", async () => {
    const named = answering({
      email: "ada@test.local",
      id: "u-1",
      name: "Ada",
    });
    const bare = answering({ email: "ada@test.local", id: "u-1" });

    expect(await accountsOfToken("neon", "k", named.fetcher)).toEqual([
      { id: "u-1", name: "Ada" },
    ]);
    expect(await accountsOfToken("neon", "k", bare.fetcher)).toEqual([
      { id: "u-1", name: "ada@test.local" },
    ]);
  });

  it("rend le refus du fournisseur, jamais le jeton", async () => {
    const { fetcher } = answering({ message: "Bad credentials" }, 401);

    const failure = await accountsOfToken("github", "ghp_secret", fetcher).then(
      () => null,
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(TokenError);
    expect((failure as Error).message).toBe("Bad credentials");
    expect((failure as Error).message).not.toContain("ghp_secret");
  });

  it("ne demande rien à 1Password, qui ne répond pas d'ici", async () => {
    const { fetcher, seen } = answering({});

    expect(
      await accountsOfToken("1password", "ops_de_test", fetcher)
    ).toBeNull();
    expect(seen).toHaveLength(0);
  });
});

describe("un jeton déjà tenu, pesé de nouveau", () => {
  it("nomme le compte tel qu'il est aujourd'hui", async () => {
    const { fetcher } = answering({ id: 42, login: "ada-renamed" });

    const checked = await checkToken("github", "ghp_de_test", fetcher);

    expect(checked).toEqual({
      ok: true,
      result: {
        account: { id: "42", name: "ada-renamed" },
        status: "answered",
      },
    });
  });

  it("pèse le jeton sur le compte connecté, pas sur le premier listé", async () => {
    const { fetcher } = answering({
      result: [
        { id: "acc-1", name: "Flymate" },
        { id: "acc-2", name: "Atelier" },
      ],
      success: true,
    });

    const checked = await checkToken(
      "cloudflare",
      "cf_multi",
      fetcher,
      "acc-2"
    );

    expect(checked).toEqual({
      ok: true,
      result: { account: { id: "acc-2", name: "Atelier" }, status: "answered" },
    });
  });

  it("refuse un jeton qui n'ouvre plus le compte connecté", async () => {
    const { fetcher } = answering({
      result: [{ id: "acc-1", name: "Flymate" }],
      success: true,
    });

    const checked = await checkToken(
      "cloudflare",
      "cf_multi",
      fetcher,
      "acc-2"
    );

    expect(checked).toMatchObject({
      ok: false,
      error: {
        phrase: {
          id: "refusal.connection.account.gone",
          values: { account: "acc-2", kind: "cloudflare" },
        },
      },
    });
  });

  it("dit qu'un jeton révoqué ne répond plus, avec les mots du fournisseur", async () => {
    const { fetcher } = answering({ message: "Bad credentials" }, 401);

    const checked = await checkToken("github", "ghp_revoque", fetcher);

    expect(checked).toMatchObject({
      ok: false,
      error: {
        code: "bad_request",
        phrase: {
          id: "refusal.connection.revoked",
          values: { kind: "github", reason: "Bad credentials" },
        },
      },
    });
    expect(JSON.stringify(checked)).not.toContain("ghp_revoque");
  });

  it("rend tous les comptes Cloudflare qu'un jeton ouvre, un compte sans nom par son identifiant", async () => {
    const { fetcher } = answering({
      result: [
        { id: "acc-1", name: "Flymate" },
        { id: "acc-2", name: "" },
        { id: "acc-3", name: "Atelier" },
      ],
      success: true,
    });

    expect(await accountsOfToken("wrangler", "cf_multi", fetcher)).toEqual([
      { id: "acc-1", name: "Flymate" },
      { id: "acc-2", name: "acc-2" },
      { id: "acc-3", name: "Atelier" },
    ]);
  });

  /** The first account the provider lists is nobody's choice: several and no name is a question, not an answer. */
  it("n'agit que sur le compte nommé, ou sur le seul qu'il y a", () => {
    const one = [{ id: "acc-1", name: "Flymate" }];
    const two = [...one, { id: "acc-2", name: "Atelier" }];

    expect(chosenAccount(one, null)).toEqual(one[0]);
    expect(chosenAccount(two, null)).toBeNull();
    expect(chosenAccount(two, "acc-2")).toEqual(two[1]);
    expect(chosenAccount(two, "acc-9")).toBeNull();
  });

  /** Cloudflare accepts a token that may not read account settings, and lists nothing: the refusal names the permission, not the symptom. */
  it("nomme la permission qui manque à un jeton Cloudflare sans compte", async () => {
    const { fetcher } = answering({ result: [], success: true });

    const checked = await checkToken("wrangler", "cf_sans_compte", fetcher);

    expect(checked).toMatchObject({
      ok: false,
      error: {
        phrase: {
          id: "refusal.connection.cloudflare.unlisted",
          values: { kind: "wrangler", reason: "no account" },
        },
      },
    });
    expect(JSON.stringify(checked)).not.toContain("cf_sans_compte");
  });

  it("dit qu'un fournisseur muet ne peut pas être interrogé", async () => {
    const { fetcher, seen } = answering({});

    const checked = await checkToken("1password", "ops_de_test", fetcher);

    expect(checked).toEqual({ ok: true, result: { status: "unaskable" } });
    expect(seen).toEqual([]);
  });
});
