import { randomBytes } from "node:crypto";
import type { InstallSecrets } from "@pupitre/shared/agent-protocol/install";
import type { SecretMark, SecretMarks } from "@shared/secrets";

/**
 * The secrets of an installation, for as long as the screen is open.
 *
 * They live here and nowhere else: not in a renderer store, not in a file, not
 * in a log line, not in `install`'s parameters. The screen sends a value in and
 * gets a mark back; only `takeSecrets` reads the values, once, to write the
 * protocol's secret line — and it empties the vault as it does.
 */

const GENERATED_BYTES = 24;

interface Held {
  value: string;
  generated: boolean;
  revealed: boolean;
}

const vaults = new Map<string, Map<string, Held>>();

function vault(serverId: string): Map<string, Held> {
  const existing = vaults.get(serverId);
  if (existing) {
    return existing;
  }

  const made = new Map<string, Held>();
  vaults.set(serverId, made);

  return made;
}

function path(moduleId: string, key: string): string {
  return `${moduleId} ${key}`;
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

  vault(serverId).set(path(moduleId, key), {
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
  vault(serverId).set(path(moduleId, key), {
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
  const held = vault(serverId).get(path(moduleId, key));

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
  vault(serverId).delete(path(moduleId, key));

  return marks(serverId);
}

export function marks(serverId: string): SecretMarks {
  const state: SecretMarks = {};

  for (const [held, secret] of vault(serverId)) {
    const [moduleId, key] = held.split(" ");
    if (!(moduleId && key)) {
      continue;
    }
    state[moduleId] ??= {};
    state[moduleId][key] = mark(secret);
  }

  return state;
}

/**
 * The line that follows the `install` request on standard input, and the end of
 * these secrets. The caller writes it and lets it go; nothing is kept for a
 * second attempt, which would mean holding a password for an install that may
 * never come.
 */
export function takeSecrets(serverId: string): InstallSecrets {
  const line: InstallSecrets = {};

  for (const [held, secret] of vault(serverId)) {
    const [moduleId, key] = held.split(" ");
    if (!(moduleId && key)) {
      continue;
    }
    line[moduleId] ??= {};
    line[moduleId][key] = secret.value;
  }

  forgetSecrets(serverId);

  return line;
}

export function forgetSecrets(serverId: string): void {
  vaults.get(serverId)?.clear();
  vaults.delete(serverId);
}
