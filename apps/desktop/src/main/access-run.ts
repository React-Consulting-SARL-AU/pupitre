import { createHash, randomInt } from "node:crypto";
import {
  ACCESS_HEADER,
  ACCESS_KEY_ALPHABET,
  ACCESS_KEY_ID_LENGTH,
  ACCESS_KEY_NAME_MAX,
  ACCESS_KEY_PREFIX,
  ACCESS_KEY_SECRET_LENGTH,
  ACCESS_QUERY,
  type AccessKey,
  AccessKeyNameSchema,
  AccessScopeSchema,
  accessKeyId,
} from "@pupitre/shared/agent-protocol/access";
import {
  ACCESS_COPY_FORMS,
  type AccessCopyForm,
  type AccessHeld,
} from "@shared/access";
import type { AgentResponse } from "@shared/agent";
import type { AccessVault } from "./access-vault";
import { refuseWith } from "./refusal";

export interface AccessDeps {
  request: (
    serverId: string,
    cmd: "access.create" | "access.revoke",
    params: Record<string, unknown>
  ) => Promise<AgentResponse<unknown>>;
  knows: (serverId: string) => boolean;
  vault: AccessVault;
  /** The project a protected name belongs to, null for any other name. */
  guardedBy: (serverId: string, hostname: string) => string | null;
  deviceName: () => string;
  open: (url: string) => void;
  copy: (text: string) => void;
  draw?: (alphabetSize: number) => number;
}

function drawn(length: number, draw: (size: number) => number): string {
  let value = "";

  for (let at = 0; at < length; at += 1) {
    value += ACCESS_KEY_ALPHABET[draw(ACCESS_KEY_ALPHABET.length)];
  }

  return value;
}

export function newKey(draw: (size: number) => number = randomInt): {
  id: string;
  key: string;
} {
  const id = drawn(ACCESS_KEY_ID_LENGTH, draw);

  return {
    id,
    key: `${ACCESS_KEY_PREFIX}${id}_${drawn(ACCESS_KEY_SECRET_LENGTH, draw)}`,
  };
}

export function hashOf(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function isKey(value: unknown): value is AccessKey {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AccessKey).id === "string"
  );
}

/** Drawn here, hashed here, kept here: the server only ever receives the hash. */
export async function createKey(
  serverId: unknown,
  name: unknown,
  projects: unknown,
  deps: AccessDeps,
  device = false
): Promise<AgentResponse<AccessKey>> {
  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return refuseWith("bad_request", "refusal.server.unknown");
  }

  const named = AccessKeyNameSchema.safeParse(
    typeof name === "string" ? name.trim().slice(0, ACCESS_KEY_NAME_MAX) : name
  );
  const scope = AccessScopeSchema.safeParse(projects);

  if (!(named.success && scope.success)) {
    return refuseWith("bad_request", "refusal.access.invalid");
  }

  const { id, key } = newKey(deps.draw);
  const answer = await deps.request(serverId, "access.create", {
    hash: hashOf(key),
    id,
    name: named.data,
    projects: scope.data,
  });

  if (!answer.ok) {
    return answer;
  }

  if (!isKey(answer.result)) {
    return refuseWith("internal", "refusal.access.unreadable");
  }

  deps.vault.keep(serverId, id, key, device);

  return { ok: true, result: answer.result };
}

export async function revokeKey(
  serverId: unknown,
  id: unknown,
  deps: AccessDeps
): Promise<AgentResponse<{ id: string }>> {
  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return refuseWith("bad_request", "refusal.server.unknown");
  }

  if (typeof id !== "string") {
    return refuseWith("bad_request", "refusal.access.invalid");
  }

  const answer = await deps.request(serverId, "access.revoke", { id });

  if (!answer.ok) {
    return answer;
  }

  deps.vault.forget(serverId, id);

  return { ok: true, result: { id } };
}

/** `listed` is what the server just answered: a key it no longer lists is forgotten here too. */
export function heldKeys(
  serverId: unknown,
  listed: unknown,
  deps: AccessDeps
): AgentResponse<AccessHeld> {
  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return refuseWith("bad_request", "refusal.server.unknown");
  }

  if (Array.isArray(listed) && listed.every((id) => typeof id === "string")) {
    deps.vault.keepOnly(serverId, listed);
  }

  const device = deps.vault.deviceKey(serverId);

  return {
    ok: true,
    result: {
      device: device ? accessKeyId(device) : null,
      held: deps.vault.held(serverId),
    },
  };
}

function withKey(url: URL, key: string): string {
  const kept = url.search.length > 1 ? `${url.search.slice(1)}&` : "";

  url.search = `${kept}${ACCESS_QUERY}=${key}`;

  return url.toString();
}

const HOSTNAME = /^[a-z0-9.-]{1,253}$/;

function hostnameOf(value: unknown): string | null {
  return typeof value === "string" && HOSTNAME.test(value) ? value : null;
}

export function copyKey(
  serverId: unknown,
  id: unknown,
  form: unknown,
  hostname: unknown,
  deps: AccessDeps
): AgentResponse<{ copied: AccessCopyForm }> {
  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return refuseWith("bad_request", "refusal.server.unknown");
  }

  if (
    typeof id !== "string" ||
    !ACCESS_COPY_FORMS.includes(form as AccessCopyForm)
  ) {
    return refuseWith("bad_request", "refusal.access.invalid");
  }

  const key = deps.vault.key(serverId, id);

  if (!key) {
    return refuseWith("bad_request", "refusal.access.elsewhere");
  }

  const chosen = form as AccessCopyForm;

  if (chosen === "key") {
    deps.copy(key);
  } else if (chosen === "header") {
    deps.copy(`${ACCESS_HEADER}: ${key}`);
  } else {
    const name = hostnameOf(hostname);

    if (!(name && deps.guardedBy(serverId, name))) {
      return refuseWith("bad_request", "refusal.access.address");
    }

    deps.copy(withKey(new URL(`https://${name}/`), key));
  }

  return { ok: true, result: { copied: chosen } };
}

async function deviceKey(
  serverId: string,
  deps: AccessDeps
): Promise<string | null> {
  const kept = deps.vault.deviceKey(serverId);

  if (kept) {
    return kept;
  }

  const created = await createKey(
    serverId,
    deps.deviceName(),
    null,
    deps,
    true
  );

  return created.ok ? deps.vault.deviceKey(serverId) : null;
}

/** A protected address opens signed in with this computer's key; any other opens as it is. */
export async function openAddress(
  serverId: unknown,
  address: unknown,
  deps: AccessDeps
): Promise<AgentResponse<{ keyed: boolean }>> {
  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return refuseWith("bad_request", "refusal.server.unknown");
  }

  let url: URL;

  try {
    url = new URL(typeof address === "string" ? address : "");
  } catch {
    return refuseWith("bad_request", "refusal.access.address");
  }

  if (url.protocol !== "https:") {
    return refuseWith("bad_request", "refusal.access.address");
  }

  if (!deps.guardedBy(serverId, url.hostname)) {
    deps.open(url.toString());

    return { ok: true, result: { keyed: false } };
  }

  const key = await deviceKey(serverId, deps);

  if (!key) {
    deps.open(url.toString());

    return refuseWith("internal", "refusal.access.device");
  }

  deps.open(withKey(url, key));

  return { ok: true, result: { keyed: true } };
}
