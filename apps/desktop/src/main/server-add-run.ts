import type { AgentResponse } from "@shared/agent";
import type {
  KeyChoice,
  KeyInstall,
  Server,
  ServerAdded,
  ServerDraft,
} from "@shared/servers";
import { refusalOf } from "./refusal";
import type { ServerCreation } from "./server-setup";
import { SetupError } from "./server-setup";
import { trace } from "./trace";

export interface AddRunDeps {
  add: (draft: ServerDraft) => Promise<ServerCreation>;
  remove: (id: string) => Promise<void>;
  install: (
    server: Server,
    publicKey: string,
    password: string
  ) => Promise<AgentResponse<KeyInstall>>;
  config: () => ServerAdded["config"];
}

const MAX_PORT = 65_535;

function isKeyChoice(value: unknown): value is KeyChoice {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const key = value as Record<string, unknown>;

  switch (key.mode) {
    case "generate":
      return true;
    case "import":
      return typeof key.file === "string";
    case "system":
      return typeof key.host === "string";
    default:
      return false;
  }
}

/** Checks the shape only: the values are checked where they are used. */
export function isServerDraft(value: unknown): value is ServerDraft {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const draft = value as Record<string, unknown>;

  return (
    typeof draft.name === "string" &&
    typeof draft.host === "string" &&
    typeof draft.user === "string" &&
    Number.isInteger(draft.port) &&
    (draft.port as number) >= 1 &&
    (draft.port as number) <= MAX_PORT &&
    (draft.slug === undefined || typeof draft.slug === "string") &&
    (draft.password === undefined ||
      draft.password === null ||
      typeof draft.password === "string") &&
    isKeyChoice(draft.key)
  );
}

function refusal(error: unknown): AgentResponse<ServerAdded> {
  return error instanceof SetupError
    ? {
        ok: false,
        error: {
          code: "bad_request",
          message: error.message,
          phrase: error.phrase,
        },
      }
    : { ok: false, error: refusalOf("internal", "refusal.server.added") };
}

export async function addServerRun(
  draft: ServerDraft,
  deps: AddRunDeps
): Promise<AgentResponse<ServerAdded>> {
  let created: ServerCreation;

  try {
    created = await deps.add(draft);
  } catch (error) {
    return refusal(error);
  }

  const { server, publicKey, copyId } = created;
  const password = draft.password ?? null;

  if (!(password && publicKey)) {
    return {
      ok: true,
      result: {
        config: deps.config(),
        copyId,
        keyInstall: null,
        publicKey,
        server,
      },
    };
  }

  const installed = await deps.install(server, publicKey, password);

  // A refused password undoes the addition, so the reader retypes it in the form with nothing to clean up.
  if (installed.ok && installed.result.status === "password") {
    await deps.remove(server.id);

    trace("servers", "withdrawn", { reason: "password", server: server.id });

    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "refusal.setup.password",
        phrase: {
          id: "refusal.setup.password",
          values: { host: server.host, user: server.user },
        },
      },
    };
  }

  return {
    ok: true,
    result: {
      config: deps.config(),
      copyId,
      keyInstall: installed.ok ? installed.result : null,
      publicKey,
      server,
    },
  };
}
