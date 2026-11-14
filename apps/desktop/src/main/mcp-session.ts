/** Newest first, as `pupitred mcp` declares them: a client asking for one gets it back, any other the newest. */
export const PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

/** The agent protocol's own ceiling, as on the server. */
export const MAX_LINE = 4 * 1024 * 1024;

const JSON_RPC = "2.0";
const CODE_PARSE = -32_700;
const CODE_INVALID_REQUEST = -32_600;
const CODE_METHOD_NOT_FOUND = -32_601;
const CODE_INVALID_PARAMS = -32_602;

export interface McpResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  run: (args: unknown) => Promise<McpResult>;
}

export interface McpServer {
  name: string;
  version: string;
  instructions: string;
  tools: () => McpTool[];
}

type Id = string | number | null;

interface Reply {
  jsonrpc: typeof JSON_RPC;
  id: Id;
  result?: unknown;
  error?: { code: number; message: string };
}

export function text(value: string): McpResult {
  return { content: [{ text: value, type: "text" }] };
}

export function refusal(value: string): McpResult {
  return { ...text(value), isError: true };
}

function success(id: Id, result: unknown): Reply {
  return { id, jsonrpc: JSON_RPC, result };
}

function failure(id: Id, code: number, message: string): Reply {
  return { error: { code, message }, id, jsonrpc: JSON_RPC };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function initialize(server: McpServer, params: unknown) {
  const asked = isRecord(params) ? params.protocolVersion : undefined;
  const version = PROTOCOL_VERSIONS.find((known) => known === asked);

  return {
    capabilities: { tools: { listChanged: false } },
    instructions: server.instructions,
    protocolVersion: version ?? PROTOCOL_VERSIONS[0],
    serverInfo: { name: server.name, version: server.version },
  };
}

function listed(tool: McpTool): Omit<McpTool, "run"> {
  const { run: _run, ...shown } = tool;

  return shown;
}

/** A tool's refusal is its result, read by the model; only a call naming no tool is a protocol error. */
async function call(server: McpServer, id: Id, params: unknown) {
  if (!(isRecord(params) && typeof params.name === "string")) {
    return failure(id, CODE_INVALID_PARAMS, "tools/call needs a tool name");
  }

  const tool = server.tools().find((known) => known.name === params.name);

  if (!tool) {
    return failure(id, CODE_INVALID_PARAMS, `unknown tool: ${params.name}`);
  }

  try {
    return success(id, await tool.run(params.arguments ?? {}));
  } catch (error) {
    return success(id, refusal((error as Error).message));
  }
}

/** Null for a notification, which is read and never answered. */
export async function answer(
  server: McpServer,
  line: string
): Promise<Reply | null> {
  let request: unknown;

  try {
    request = JSON.parse(line);
  } catch (error) {
    return failure(null, CODE_PARSE, (error as Error).message);
  }

  if (!isRecord(request)) {
    return failure(null, CODE_INVALID_REQUEST, "not a JSON-RPC request");
  }

  const notification = !("id" in request);
  const id = isId(request.id) ? request.id : null;

  if (request.jsonrpc !== JSON_RPC || typeof request.method !== "string") {
    return notification
      ? null
      : failure(id, CODE_INVALID_REQUEST, "not a JSON-RPC request");
  }

  if (notification) {
    return null;
  }

  switch (request.method) {
    case "initialize":
      return success(id, initialize(server, request.params));
    case "ping":
      return success(id, {});
    case "tools/list":
      return success(id, { tools: server.tools().map(listed) });
    case "tools/call":
      return await call(server, id, request.params);
    default:
      return failure(
        id,
        CODE_METHOD_NOT_FOUND,
        `unknown method: ${request.method}`
      );
  }
}

/** One message per line, answered in the order it came: a client waits on its call anyway. */
export function lineSession(
  server: McpServer,
  write: (line: string) => void
): { feed: (chunk: string) => void } {
  let pending = "";
  let queue = Promise.resolve();

  const take = (line: string) => {
    queue = queue.then(async () => {
      const reply = await answer(server, line);

      if (reply) {
        write(`${JSON.stringify(reply)}\n`);
      }
    });
  };

  return {
    feed(chunk) {
      pending += chunk;

      if (pending.length > MAX_LINE && !pending.includes("\n")) {
        pending = "";
        write(
          `${JSON.stringify(failure(null, CODE_INVALID_REQUEST, "line too long"))}\n`
        );

        return;
      }

      const lines = pending.split("\n");

      pending = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim().length > 0) {
          take(line);
        }
      }
    },
  };
}
