import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loginAddress } from "../terminal-links";
import { openScreen, type Screen } from "../terminal-screen";

const CLAUDE =
  "https://claude.com/cai/oauth/authorize?code=true&client_id=client-client-client-client-client-c&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile+user%3Ainference+user%3Asessions%3Aclaude_code+user%3Amcp_servers+user%3Afile_upload&code_challenge=challenge-challenge-challenge-challenge-cha&code_challenge_method=S256&state=state-state-state-state-state-state-state-s";

/** What tmux 3.4 sends the app for Claude Code's login screen: no hyperlink, three positioned rows. */
function tmuxLogin(): { cols: number; rows: number; data: string } {
  return JSON.parse(
    readFileSync(
      join(import.meta.dir, "fixtures/tmux-claude-login.json"),
      "utf8"
    )
  );
}

function fed(screen: Screen, data: string): Promise<void> {
  return new Promise((resolve) => screen.write(data, resolve));
}

describe("a session's screen", () => {
  it("reads back whole the address tmux wrapped over three lines", async () => {
    const frame = tmuxLogin();
    const screen = openScreen(frame.cols, frame.rows);

    await fed(screen, frame.data);

    expect(loginAddress(screen.lines(), screen.cols())).toEqual({
      host: "claude.com",
      url: CLAUDE,
    });
    screen.dispose();
  });

  it("also reads it back when it arrives in pieces", async () => {
    const frame = tmuxLogin();
    const screen = openScreen(frame.cols, frame.rows);
    let login: ReturnType<typeof loginAddress> = null;

    for (let at = 0; at < frame.data.length; at += 100) {
      await fed(screen, frame.data.slice(at, at + 100));
      login = loginAddress(screen.lines(), screen.cols(), login);
    }

    expect(login?.url).toBe(CLAUDE);
    screen.dispose();
  });

  it("follows the window width", async () => {
    const screen = openScreen(10, 3);

    screen.resize(20, 3);
    await fed(screen, "https://claude.ai/oauth/authorize?state=x");

    expect(screen.cols()).toBe(20);
    expect(loginAddress(screen.lines(), screen.cols())?.url).toBe(
      "https://claude.ai/oauth/authorize?state=x"
    );
    screen.dispose();
  });
});
