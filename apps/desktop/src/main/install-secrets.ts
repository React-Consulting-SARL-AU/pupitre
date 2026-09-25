import { randomBytes } from "node:crypto";
import type { InstallSecrets } from "@pupitre/shared/agent-protocol/install";
import type { SecretMark, SecretMarks } from "@shared/secrets";

/**
 * The secrets of an installation, for as long as the screen is open.
 *
 * They live here and nowhere else: not in a renderer store, not in a file, not
 * in a log line, not in `install`'s parameters. The screen sends a value in and
 * gets a mark back; only `readSecrets` reads the values, to write the
 * protocol's secret line, and the vault is emptied once the agent has taken it.
 */

const GENERATED_BYTES = 24;

interface Held {
  value: string;
  generated: boolean;
  revealed: boolean;
}

const vaults = new Map<string, Map<string, Map<string, Held>>>();

function vault(serverId: string): Map<string, Map<string, Held>> {
  const existing = vaults.get(serverId);
  if (existing) {
    return existing;
  }

  const made = new Map<string, Map<string, Held>>();
  vaults.set(serverId, made);

  return made;
}

function moduleVault(serverId: string, moduleId: string): Map<string, Held> {
  const server = vault(serverId);
  const existing = server.get(moduleId);
  if (existing) {
    return existing;
  }

  const made = new Map<string, Held>();
  server.set(moduleId, made);

  return made;
}

function mark(held: Held): SecretMark {
  return {
    filled: held.value.length > 0,
    generated: held.generated,
    revealed: held.revealed,
  };
}

export function setSecret(
  serverId: string,
  moduleId: string,
  key: string,
  value: string
): SecretMarks {
  if (value.length === 0) {
    return clearSecret(serverId, moduleId, key);
  }

  moduleVault(serverId, moduleId).set(key, {
    value,
    generated: false,
    revealed: false,
  });

  return marks(serverId);
}

/**
 * A secret the reader never has to invent, made where it will be sent from.
 *
 * Base64url of 24 random bytes: long enough that no dictionary reaches it, and
 * safe in a connection string, a systemd unit and a shell argument alike.
 */
export function generateSecret(
  serverId: string,
  moduleId: string,
  key: string
): SecretMarks {
  moduleVault(serverId, moduleId).set(key, {
    value: randomBytes(GENERATED_BYTES).toString("base64url"),
    generated: true,
    revealed: false,
  });

  return marks(serverId);
}

/** Once. A second call answers nothing, whoever asks. */
export function revealSecret(
  serverId: string,
  moduleId: string,
  key: string
): string | null {
  const held = moduleVault(serverId, moduleId).get(key);

  if (!held || held.revealed) {
    return null;
  }

  held.revealed = true;

  return held.value;
}

export function clearSecret(
  serverId: string,
  moduleId: string,
  key: string
): SecretMarks {
  moduleVault(serverId, moduleId).delete(key);

  return marks(serverId);
}

export function marks(serverId: string): SecretMarks {
  const state: SecretMarks = {};

  for (const [moduleId, secrets] of vault(serverId)) {
    for (const [key, secret] of secrets) {
      state[moduleId] ??= {};
      state[moduleId][key] = mark(secret);
    }
  }

  return state;
}

/**
 * The line that follows the `install` request on standard input.
 *
 * The vault is not emptied here: a request the agent refuses — a field wrong
 * elsewhere in the form, a machine busy, a line cut before it read anything —
 * has consumed nothing, and the next Apply must carry the same secrets. The
 * caller forgets them once the agent has accepted the install.
 */
export function readSecrets(serverId: string): InstallSecrets {
  const line: InstallSecrets = {};

  for (const [moduleId, secrets] of vault(serverId)) {
    for (const [key, secret] of secrets) {
      line[moduleId] ??= {};
      line[moduleId][key] = secret.value;
    }
  }

  return line;
}

export function forgetSecrets(serverId: string): void {
  vaults.get(serverId)?.clear();
  vaults.delete(serverId);
}
