import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isServerId } from "@shared/ssh-names";
import type { SudoPasswordState } from "@shared/sudo";
import type { Sealer } from "./account-vault";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export interface SudoVault {
  keep: (serverId: string, password: string) => void;
  password: (serverId: string) => string | null;
  state: (serverId: string) => SudoPasswordState;
  forget: (serverId: string) => void;
}

/** Without a keychain the password lives for the run only, never in a readable file. */
export function createSudoVault({
  dir,
  sealer,
}: {
  dir: string;
  sealer: Sealer;
}): SudoVault {
  const held = new Map<string, string>();

  function fileOf(serverId: string): string | null {
    return isServerId(serverId) ? join(dir, `${serverId}.password`) : null;
  }

  function sealedCopy(serverId: string): string | null {
    const path = fileOf(serverId);

    if (!(path && sealer.available() && existsSync(path))) {
      return null;
    }

    try {
      return sealer.decrypt(readFileSync(path));
    } catch {
      return null;
    }
  }

  function keep(serverId: string, password: string): void {
    const path = fileOf(serverId);

    if (!path) {
      throw new Error(`unusable server id: ${serverId}`);
    }

    held.set(serverId, password);

    if (!sealer.available()) {
      return;
    }

    mkdirSync(dir, { mode: DIR_MODE, recursive: true });
    chmodSync(dir, DIR_MODE);
    writeFileSync(path, sealer.encrypt(password), { mode: FILE_MODE });
    chmodSync(path, FILE_MODE);
  }

  function password(serverId: string): string | null {
    return held.get(serverId) ?? sealedCopy(serverId);
  }

  function state(serverId: string): SudoPasswordState {
    const path = fileOf(serverId);
    const kept = Boolean(path && sealer.available() && existsSync(path));

    return { held: kept || held.has(serverId), kept };
  }

  function forget(serverId: string): void {
    held.delete(serverId);

    const path = fileOf(serverId);

    if (path) {
      rmSync(path, { force: true });
    }
  }

  return { forget, keep, password, state };
}
