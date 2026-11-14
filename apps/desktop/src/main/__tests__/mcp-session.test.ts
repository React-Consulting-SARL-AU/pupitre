import { describe, expect, it } from "bun:test";
import {
  answer,
  lineSession,
  type McpServer,
  type McpTool,
  refusal,
  text,
} from "../mcp-session";

const echo: McpTool = {
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  },
  description: "Echo",
  inputSchema: { type: "object" },
  name: "echo",
  run: (args) => Promise.resolve(text(JSON.stringify(args))),
  title: "Echo",
};

const failing: McpTool = {
  ...echo,
  name: "failing",
  run: () => Promise.reject(new Error("broke")),
};

const server: McpServer = {
  instructions: "Use echo.",
  name: "pupitre",
  tools: () => [echo, failing],
  version: "2.5.0",
};

function request(method: string, params?: unknown, id: unknown = 1): string {
  return JSON.stringify({ id, jsonrpc: "2.0", method, params });
}

describe("answer", () => {
  it("gives back a protocol version it knows, the newest otherwise", async () => {
    const known = await answer(
      server,
      request("initialize", { protocolVersion: "2025-03-26" })
    );
    const unknown = await answer(
      server,
      request("initialize", { protocolVersion: "1999-01-01" })
    );

    expect(known?.result).toMatchObject({
      instructions: "Use echo.",
      protocolVersion: "2025-03-26",
      serverInfo: { name: "pupitre", version: "2.5.0" },
    });
    expect(unknown?.result).toMatchObject({ protocolVersion: "2025-11-25" });
  });

  it("lists the tools without their runner", async () => {
    const reply = await answer(server, request("tools/list"));
    const { tools } = (reply?.result ?? { tools: [] }) as {
      tools: Record<string, unknown>[];
    };

    expect(tools.map((tool) => tool.name)).toEqual(["echo", "failing"]);
    expect(tools[0]).not.toHaveProperty("run");
  });

  it("runs a tool with its arguments", async () => {
    const reply = await answer(
      server,
      request("tools/call", { arguments: { a: 1 }, name: "echo" })
    );

    expect(reply?.result).toEqual(text('{"a":1}'));
  });

  it("turns a tool that throws into a refusal the model reads", async () => {
    const reply = await answer(
      server,
      request("tools/call", { name: "failing" })
    );

    expect(reply?.result).toEqual(refusal("broke"));
  });

  it("answers an unknown tool and an unknown method as protocol errors", async () => {
    const tool = await answer(server, request("tools/call", { name: "nope" }));
    const method = await answer(server, request("resources/list"));

    expect(tool?.error?.code).toBe(-32_602);
    expect(method?.error?.code).toBe(-32_601);
  });

  it("never answers a notification", async () => {
    const reply = await answer(
      server,
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
    );

    expect(reply).toBeNull();
  });

  it("answers a line that is not JSON with a parse error", async () => {
    const reply = await answer(server, "{not json");

    expect(reply).toMatchObject({ error: { code: -32_700 }, id: null });
  });
});

describe("lineSession", () => {
  it("answers each complete line in order, across chunks", async () => {
    const written: string[] = [];
    const session = lineSession(server, (line) => written.push(line));

    session.feed(request("ping", undefined, 1).slice(0, 10));
    session.feed(
      `${request("ping", undefined, 1).slice(10)}\n${request("ping", undefined, 2)}\n`
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(written.map((line) => JSON.parse(line).id)).toEqual([1, 2]);
  });
});
