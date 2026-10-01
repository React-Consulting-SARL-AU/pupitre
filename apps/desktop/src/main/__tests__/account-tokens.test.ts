import { describe, expect, it } from "bun:test";
import {
  accountsOfToken,
  checkToken,
  chosenAccount,
  TokenError,
} from "../account-tokens";

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

describe("what a token opens", () => {
  it("names the GitHub account, without the token going anywhere else", async () => {
    const { fetcher, seen } = answering({ id: 42, login: "ada" });

    const accounts = await accountsOfToken("github", "ghp_de_test", fetcher);

    expect(accounts).toEqual([{ id: "42", name: "ada" }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.github.com/user");
    expect(seen[0]?.token).toBe("Bearer ghp_de_test");
  });

  it("names the Neon account by its name, otherwise by its address", async () => {
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

  it("names the Vercel, Supabase and Stripe accounts as their dashboards do", async () => {
    const vercel = answering({
      user: { email: "ada@test.local", id: "u-1", username: "ada" },
    });
    const supabase = answering({
      gotrue_id: "g-1",
      primary_email: "ada@test.local",
      username: "ada",
    });
    const stripe = answering({
      id: "acct_1",
      settings: { dashboard: { display_name: "Ada SAS" } },
    });

    expect(await accountsOfToken("vercel", "k", vercel.fetcher)).toEqual([
      { id: "u-1", name: "ada" },
    ]);
    expect(await accountsOfToken("supabase", "k", supabase.fetcher)).toEqual([
      { id: "g-1", name: "ada" },
    ]);
    expect(await accountsOfToken("stripe", "k", stripe.fetcher)).toEqual([
      { id: "acct_1", name: "Ada SAS" },
    ]);
    expect(vercel.seen[0]?.url).toBe("https://api.vercel.com/v2/user");
  });

  it("reads the refusal that Stripe and Vercel nest under error", async () => {
    const refused = answering(
      { error: { message: "Invalid API Key provided", type: "invalid" } },
      401
    );

    await expect(
      accountsOfToken("stripe", "k", refused.fetcher)
    ).rejects.toThrow("Invalid API Key provided");
  });

  it("returns the provider's refusal, never the token", async () => {
    const { fetcher } = answering({ message: "Bad credentials" }, 401);

    const failure = await accountsOfToken("github", "ghp_secret", fetcher).then(
      () => null,
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(TokenError);
    expect((failure as Error).message).toBe("Bad credentials");
    expect((failure as Error).message).not.toContain("ghp_secret");
  });

  it("asks nothing of 1Password, which does not answer from here", async () => {
    const { fetcher, seen } = answering({});

    expect(
      await accountsOfToken("1password", "ops_de_test", fetcher)
    ).toBeNull();
    expect(seen).toHaveLength(0);
  });
});

describe("a token already held, weighed again", () => {
  it("names the account as it is today", async () => {
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

  it("weighs the token on the connected account, not the first one listed", async () => {
    const { fetcher } = answering({
      result: [
        { id: "acc-1", name: "Flyleaf" },
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

  it("refuses a token that no longer opens the connected account", async () => {
    const { fetcher } = answering({
      result: [{ id: "acc-1", name: "Flyleaf" }],
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

  it("says a revoked token no longer answers, in the provider's words", async () => {
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

  it("returns every Cloudflare account a token opens, an unnamed account by its identifier", async () => {
    const { fetcher } = answering({
      result: [
        { id: "acc-1", name: "Flyleaf" },
        { id: "acc-2", name: "" },
        { id: "acc-3", name: "Atelier" },
      ],
      success: true,
    });

    expect(await accountsOfToken("wrangler", "cf_multi", fetcher)).toEqual([
      { id: "acc-1", name: "Flyleaf" },
      { id: "acc-2", name: "acc-2" },
      { id: "acc-3", name: "Atelier" },
    ]);
  });

  // The first account listed is nobody's choice: several and no name is a question, not an answer.
  it("acts only on the named account, or on the only one there is", () => {
    const one = [{ id: "acc-1", name: "Flyleaf" }];
    const two = [...one, { id: "acc-2", name: "Atelier" }];

    expect(chosenAccount(one, null)).toEqual(one[0]);
    expect(chosenAccount(two, null)).toBeNull();
    expect(chosenAccount(two, "acc-2")).toEqual(two[1]);
    expect(chosenAccount(two, "acc-9")).toBeNull();
  });

  // Cloudflare accepts a token that may not read account settings, and then lists no account at all.
  it("names the permission missing from a Cloudflare token with no account", async () => {
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

  it("says a silent provider cannot be queried", async () => {
    const { fetcher, seen } = answering({});

    const checked = await checkToken("1password", "ops_de_test", fetcher);

    expect(checked).toEqual({ ok: true, result: { status: "unaskable" } });
    expect(seen).toEqual([]);
  });
});
