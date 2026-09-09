import { describe, expect, it } from "bun:test";
import { accountOfToken, TokenError } from "../account-tokens";

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

    const account = await accountOfToken("github", "ghp_de_test", fetcher);

    expect(account).toEqual({ id: "42", name: "ada" });
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

    expect(await accountOfToken("neon", "k", named.fetcher)).toEqual({
      id: "u-1",
      name: "Ada",
    });
    expect(await accountOfToken("neon", "k", bare.fetcher)).toEqual({
      id: "u-1",
      name: "ada@test.local",
    });
  });

  it("rend le refus du fournisseur, jamais le jeton", async () => {
    const { fetcher } = answering({ message: "Bad credentials" }, 401);

    const failure = await accountOfToken("github", "ghp_secret", fetcher).then(
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
      await accountOfToken("1password", "ops_de_test", fetcher)
    ).toBeNull();
    expect(seen).toHaveLength(0);
  });
});
