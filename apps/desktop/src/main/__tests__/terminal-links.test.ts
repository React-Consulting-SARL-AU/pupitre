import { describe, expect, it } from "bun:test";
import { loginAddress, loopbackRedirect, unwrap } from "../terminal-links";

const COLS = 40;

const CLAUDE =
  "https://claude.ai/oauth/authorize?code=true&client_id=abc&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile&state=xyz";

const CODEX =
  "https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_EMoamEEZ73f0CkXaXp7hrann&redirect_uri=http%3A%2F%2Flocalhost%3A1457%2Fauth%2Fcallback&scope=openid%20profile%20email%20offline_access&code_challenge=XV067cyPa7ZgBs0KFgypllzdYY_SDcD2RiYOLvfsIyw&code_challenge_method=S256&state=zWUR3I5fTFUEZTLSh5J8mytJsWQ1_L6PDi7Hi-HLL0U&originator=codex-tui";

/** The address as a box of the given inner width shows it, one row per line. */
function folded(url: string, width: number, margin = 0): string[] {
  const rows: string[] = [];

  for (let at = 0; at < url.length; at += width) {
    rows.push(" ".repeat(margin) + url.slice(at, at + width));
  }

  return rows;
}

describe("les lignes pliées d'un écran", () => {
  it("recollent une ligne pleine jusqu'au bord avec celle qui la suit", () => {
    expect(unwrap(["a".repeat(COLS), "bcd", "e"], COLS)).toEqual([
      `${"a".repeat(COLS)}bcd`,
      "e",
    ]);
  });

  it("recollent une ligne en retrait que le terminal a pliée lui-même au bord", () => {
    const rows = [`  ${"a".repeat(COLS - 2)}`, "b".repeat(COLS), "cd", "e"];

    expect(unwrap(rows, COLS)).toEqual([
      `  ${"a".repeat(COLS - 2)}${"b".repeat(COLS)}cd`,
      "e",
    ]);
  });

  it("recollent une ligne qui s'arrête à la marge d'un cadre symétrique", () => {
    const rows = [` ${"a".repeat(COLS - 2)}`, " bcd", "e"];

    expect(unwrap(rows, COLS)).toEqual([` ${"a".repeat(COLS - 2)}bcd`, "e"]);
  });

  it("laissent seules une ligne courte, une suite en retrait, et une ligne vide", () => {
    expect(unwrap(["abc", "def"], COLS)).toEqual(["abc", "def"]);
    expect(unwrap(["a".repeat(COLS), " def"], COLS)).toEqual([
      "a".repeat(COLS),
      " def",
    ]);
    expect(unwrap(["a".repeat(COLS), "", "def"], COLS)).toEqual([
      "a".repeat(COLS),
      "",
      "def",
    ]);
  });
});

describe("l'adresse de connexion d'un agent", () => {
  it("se lit sur une seule ligne, au milieu de ce que l'agent dessine", () => {
    const rows = [
      "Ouvre https://claude.ai/oauth/authorize?code=true&state=abc",
      "Paste code here if prompted >",
    ];

    expect(loginAddress(rows, 80)).toEqual({
      host: "claude.ai",
      url: "https://claude.ai/oauth/authorize?code=true&state=abc",
    });
  });

  it("se relit entière quand l'écran la plie sur plusieurs lignes", () => {
    expect(loginAddress(folded(CLAUDE, COLS), COLS)).toEqual({
      host: "claude.ai",
      url: CLAUDE,
    });
  });

  it("se relit entière dans un cadre à marges", () => {
    expect(loginAddress(folded(CLAUDE, COLS - 2, 1), COLS)).toEqual({
      host: "claude.ai",
      url: CLAUDE,
    });
  });

  it("se relit entière telle que Codex l'écrit, en retrait puis pliée au bord", () => {
    const rows = [
      "  If the link doesn't open automatically, open the following link to authenticate:",
      " ",
      `  ${CODEX.slice(0, COLS - 2)}`,
      ...folded(CODEX.slice(COLS - 2), COLS),
      "",
      "  Press esc to cancel",
    ];

    expect(loginAddress(rows, COLS)).toEqual({
      host: "auth.openai.com",
      url: CODEX,
    });
  });

  it("ne prend pas pour une nouvelle adresse un morceau de celle déjà connue", () => {
    const known = { host: "claude.ai", url: CLAUDE };
    const [first] = folded(CLAUDE, COLS);

    expect(loginAddress([first ?? ""], COLS, known)).toEqual(known);
    expect(
      loginAddress(["https://claude.ai/oauth/authorize?state=abc"], COLS, known)
        ?.url
    ).toContain("state=abc");
    expect(loginAddress(["Rien."], COLS, known)).toEqual(known);
  });

  it("garde la dernière quand l'agent en réimprime une", () => {
    const rows = [
      "https://claude.ai/oauth/authorize?state=un",
      "https://claude.ai/oauth/authorize?state=deux",
    ];

    expect(loginAddress(rows, 80)?.url).toContain("state=deux");
  });

  it("reconnaît un flux qui revient sur un port de la machine, quel que soit l'hôte", () => {
    const neon =
      "Auth Url: https://oauth2.neon.tech/oauth2/auth?client_id=neonctl&redirect_uri=http%3A%2F%2F127.0.0.1%3A41233%2Fcallback&state=x";
    const other =
      "https://auth.exemple.test/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback";

    expect(loginAddress([neon], 200)).toMatchObject({
      host: "oauth2.neon.tech",
    });
    expect(loginAddress([other], 200)).toMatchObject({
      host: "auth.exemple.test",
    });
  });

  it("reconnaît la connexion de Cursor", () => {
    const cursor =
      "Open a browser and navigate to this link: https://cursor.com/loginDeepControl?challenge=abc&uuid=67d2eb92&mode=login&redirectTarget=cli";

    expect(loginAddress([cursor], 200)).toMatchObject({ host: "cursor.com" });
  });

  it("reconnaît la connexion de Gemini par son compte Google", () => {
    const gemini =
      "Please visit the following URL to authorize the application:\n\nhttps://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fcodeassist.google.com%2Fauthcode&scope=x&state=y";

    expect(loginAddress([gemini], 200)).toMatchObject({
      host: "accounts.google.com",
    });
  });

  it("n'en fait pas une d'une adresse quelconque", () => {
    expect(loginAddress(["https://exemple.test/connexion"], 80)).toBeNull();
    expect(
      loginAddress(
        [
          "https://exemple.test/a?redirect_uri=https%3A%2F%2Fexemple.test%2Fretour",
        ],
        80
      )
    ).toBeNull();
    expect(loginAddress(["Rien à ouvrir ici."], 80)).toBeNull();
  });
});

describe("le port sur lequel une connexion revient", () => {
  it("se lit dans le redirect_uri quand il vise la boucle locale", () => {
    expect(
      loopbackRedirect(
        "https://claude.ai/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A54545%2Fcallback&state=x"
      )
    ).toBe(54_545);
    expect(
      loopbackRedirect(
        "https://oauth2.neon.tech/oauth2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A41233%2Fcallback"
      )
    ).toBe(41_233);
  });

  it("n'existe pas pour un retour ailleurs, ni sans port", () => {
    expect(
      loopbackRedirect(
        "https://claude.ai/oauth/authorize?redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback"
      )
    ).toBeNull();
    expect(
      loopbackRedirect(
        "https://exemple.test/a?redirect_uri=http%3A%2F%2Flocalhost%2Fcallback"
      )
    ).toBeNull();
    expect(loopbackRedirect("https://claude.ai/oauth/authorize")).toBeNull();
    expect(loopbackRedirect("pas une adresse")).toBeNull();
  });
});
