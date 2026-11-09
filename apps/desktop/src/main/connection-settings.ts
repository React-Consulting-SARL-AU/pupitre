import {
  INFISICAL_CLIENT_ID_MAX,
  INFISICAL_CLIENT_ID_PATTERN,
} from "@pupitre/shared/catalog";
import { matchesFormat } from "@pupitre/shared/catalog/formats";
import type { AgentResponse } from "@shared/agent";
import type { ConnectionKind, ConnectionSettings } from "@shared/connections";
import { refuseWith } from "./refusal";

const clientIdPattern = new RegExp(INFISICAL_CLIENT_ID_PATTERN);

const TRAILING_SLASHES = /\/+$/;

function text(raw: unknown, key: string): string {
  if (typeof raw !== "object" || raw === null) {
    return "";
  }

  const value = (raw as Record<string, unknown>)[key];

  return typeof value === "string" ? value.trim() : "";
}

/** Only Infisical takes settings; any other provider's are refused rather than kept unread. */
export function checkedSettings(
  kind: ConnectionKind,
  raw: unknown
): AgentResponse<ConnectionSettings> {
  if (kind !== "infisical") {
    return raw === undefined
      ? { ok: true, result: {} }
      : refuseWith("bad_request", "refusal.params.invalid", {
          cmd: "connections:connect",
        });
  }

  const domain = text(raw, "domain").replace(TRAILING_SLASHES, "");
  const clientId = text(raw, "client_id");

  if (!matchesFormat("url", domain)) {
    return refuseWith("bad_request", "refusal.connection.infisical.domain");
  }

  if (
    !clientIdPattern.test(clientId) ||
    clientId.length > INFISICAL_CLIENT_ID_MAX
  ) {
    return refuseWith("bad_request", "refusal.connection.infisical.clientId");
  }

  return { ok: true, result: { client_id: clientId, domain } };
}

/** What the vault kept beside a token, strings only. */
export function heldSettings(
  kept: Record<string, unknown> | null
): ConnectionSettings {
  return Object.fromEntries(
    Object.entries(kept ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
