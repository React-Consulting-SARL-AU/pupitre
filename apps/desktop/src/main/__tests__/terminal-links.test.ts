import { describe, expect, it } from "bun:test";
import { loginAddress, loopbackRedirect, unwrap } from "../terminal-links";

const COLS = 40;

const CLAUDE =
  "https://claude.ai/oauth/authorize?code=true&client_id=abc&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile&state=xyz";

const CODEX =
  "https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_EMoamEEZ73f0CkXaXp7hrann&redirect_uri=http%3A%2F%2Flocalhost%3A1457%2Fauth%2Fcallback&scope=openid%20profile%20email%20offline_access&code_challenge=XV067cyPa7ZgBs0KFgypllzdYY_SDcD2RiYOLvfsIyw&code_challenge_method=S256&state=zWUR3I5fTFUEZTLSh5J8mytJsWQ1_L6PDi7Hi-HLL0U&originator=codex-tui";

function folded(url: string, width: number, margin = 0): string[] {
  const rows: string[] = [];

  for (let at = 0; at < url.length; at += width) {
    rows.push(" ".repeat(margin) + url.slice(at, at + width));
  }

  return rows;
}

describe("the wrapped lines of a screen", () => {
  it("rejoin a line full to the edge with the one that follows", () => {
    expect(unwrap(["a".repeat(COLS), "bcd", "e"], COLS)).toEqual([
      `${"a".repeat(COLS)}bcd`,
      "e",
    ]);
  });

  it("rejoin an indented line that the terminal itself wrapped at the edge", () => {
    const rows = [`  ${"a".repeat(COLS - 2)}`, "b".repeat(COLS), "cd", "e"];

    expect(unwrap(rows, COLS)).toEqual([
      `  ${"a".repeat(COLS - 2)}${"b".repeat(COLS)}cd`,
      "e",
    ]);
  });

  it("rejoin a line that stops at the margin of a symmetric frame", () => {
    const rows = [` ${"a".repeat(COLS - 2)}`, " bcd", "e"];

    expect(unwrap(rows, COLS)).toEqual([` ${"a".repeat(COLS - 2)}bcd`, "e"]);
  });

  it("leave alone a short line, an indented continuation, and an empty line", () => {
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

describe("an agent's login address", () => {
  it("reads on a single line, amid what the agent draws", () => {
    const rows = [
      "Ouvre https://claude.ai/oauth/authorize?code=true&state=abc",
      "Paste code here if prompted >",
    ];

    expect(loginAddress(rows, 80)).toEqual({
      host: "claude.ai",
      url: "https://claude.ai/oauth/authorize?code=true&state=abc",
    });
  });

  it("is read back whole when the screen wraps it over several lines", () => {
    expect(loginAddress(folded(CLAUDE, COLS), COLS)).toEqual({
      host: "claude.ai",
      url: CLAUDE,
    });
  });

  it("is read back whole inside a frame with margins", () => {
    expect(loginAddress(folded(CLAUDE, COLS - 2, 1), COLS)).toEqual({
      host: "claude.ai",
      url: CLAUDE,
    });
  });

  it("is read back whole as Codex writes it, indented then wrapped at the edge", () => {
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

  it("does not mistake a piece of the already known address for a new one", () => {
    const known = { host: "claude.ai", url: CLAUDE };
    const [first] = folded(CLAUDE, COLS);

    expect(loginAddress([first ?? ""], COLS, known)).toEqual(known);
    expect(
      loginAddress(["https://claude.ai/oauth/authorize?state=abc"], COLS, known)
        ?.url
    ).toContain("state=abc");
    expect(loginAddress(["Rien."], COLS, known)).toEqual(known);
  });

  it("keeps the last one when the agent reprints one", () => {
    const rows = [
      "https://claude.ai/oauth/authorize?state=un",
      "https://claude.ai/oauth/authorize?state=deux",
    ];

    expect(loginAddress(rows, 80)?.url).toContain("state=deux");
  });

  it("recognises a flow that returns on a port of the machine, whatever the host", () => {
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

  it("recognises Cursor's login", () => {
    const cursor =
      "Open a browser and navigate to this link: https://cursor.com/loginDeepControl?challenge=abc&uuid=67d2eb92&mode=login&redirectTarget=cli";

    expect(loginAddress([cursor], 200)).toMatchObject({ host: "cursor.com" });
  });

  it("recognises Gemini's login through its Google account", () => {
    const gemini =
      "Please visit the following URL to authorize the application:\n\nhttps://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fcodeassist.google.com%2Fauthcode&scope=x&state=y";

    expect(loginAddress([gemini], 200)).toMatchObject({
      host: "accounts.google.com",
    });
  });

  it("does not make one out of an arbitrary address", () => {
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

describe("the port a login returns on", () => {
  it("is read from the redirect_uri when it targets the loopback", () => {
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

  it("does not exist for a return elsewhere, nor without a port", () => {
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
