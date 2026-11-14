import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { toggle } from "./harness/controls";
import { SERVERS } from "./harness/fixtures";
import { launchPupitre, type Running } from "./harness/launch";

interface Reply {
  id: number;
  result: {
    tools?: { name: string }[];
    content?: { text: string }[];
    isError?: boolean;
  };
}

/** One session on the app's socket, as `nc -U` would carry it for a client. */
function ask(socket: string, requests: unknown[]): Promise<Reply[]> {
  return new Promise((resolve, reject) => {
    const replies: Reply[] = [];
    let pending = "";
    const connection = createConnection(socket, () => {
      for (const request of requests) {
        connection.write(`${JSON.stringify(request)}\n`);
      }
    });

    connection.setEncoding("utf8");
    connection.on("error", reject);
    connection.on("data", (chunk: string) => {
      pending += chunk;

      const lines = pending.split("\n");

      pending = lines.pop() ?? "";
      replies.push(...lines.map((line) => JSON.parse(line) as Reply));

      if (replies.length === requests.length) {
        connection.end();
        resolve(replies);
      }
    });
  });
}

function call(id: number, name: string, args: unknown) {
  return {
    id,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: args, name },
  };
}

test.describe("the AI agents of this computer", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  // The harness answers the server list over IPC, so the main process knows no machine: their entries are unit-tested.
  test("the switch declares the app to the clients, its socket answers, and switching off takes it out", async () => {
    const { app, page } = running;

    const userData = await app.evaluate(({ app: electron }) =>
      electron.getPath("userData")
    );
    // The harness keeps the clients' files inside the throwaway home.
    const claudeDir =
      process.platform === "darwin"
        ? join(userData, "home", "Library", "Application Support", "Claude")
        : join(userData, "home", ".config", "Claude");
    const claudeFile = join(claudeDir, "claude_desktop_config.json");

    mkdirSync(claudeDir, { recursive: true });

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "Agents IA" }).click();

    const agents = toggle(
      page,
      "Laisser les agents IA de cet ordinateur piloter Pupitre"
    );
    const unattended = toggle(
      page,
      "Appliquer leurs modifications sans me demander"
    );
    const claudeDesktop = page.locator('[data-agent-client="claude-desktop"]');

    await expect(agents).not.toBeChecked();
    await expect(unattended).toBeDisabled();
    await expect(claudeDesktop).toHaveAttribute("data-state", "off");
    await agents.click();
    await expect(agents).toBeChecked();
    await expect(unattended).toBeEnabled();

    await expect(claudeDesktop).toHaveAttribute("data-state", "connected");
    await expect(claudeDesktop).toContainText("Branché");
    await expect(claudeDesktop).toContainText("pupitre");
    await expect(
      page.locator('[data-agent-client="claude-code"]')
    ).toContainText("Non installé sur cet ordinateur");
    await expect(page.locator('[data-agent-entry="pupitre"]')).toBeVisible();
    await assertAccessible(page, "reglages/agents");

    const declared = JSON.parse(readFileSync(claudeFile, "utf8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const entry = declared.mcpServers.pupitre;

    expect(Object.keys(declared.mcpServers)).toEqual(["pupitre"]);
    expect(entry?.command.endsWith("/nc")).toBe(true);
    expect(entry?.args[0]).toBe("-U");

    const socket = entry?.args[1] ?? "";
    const [initialized, listed, servers, removal] = await ask(socket, [
      {
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      },
      { id: 2, jsonrpc: "2.0", method: "tools/list" },
      call(3, "servers", {}),
      call(4, "project_remove", {
        name: "shop",
        server: SERVERS.servers[0]?.id,
      }),
    ]);

    expect(initialized?.id).toBe(1);
    expect(listed?.result.tools?.map((tool) => tool.name)).toContain(
      "module_install"
    );
    expect(JSON.parse(servers?.result.content?.[0]?.text ?? "")).toEqual([]);
    expect(removal?.result.isError).toBe(true);
    expect(removal?.result.content?.[0]?.text).toContain("unknown server");

    await agents.click();
    await expect(agents).not.toBeChecked();

    const after = JSON.parse(readFileSync(claudeFile, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };

    expect(after.mcpServers).toEqual({});
    expect(existsSync(socket)).toBe(false);
    await expect(claudeDesktop).toHaveAttribute("data-state", "off");
  });
});
