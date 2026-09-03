import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { Server, ServersConfig } from "@shared/contract";
import {
  type ServerProfile,
  cleanProfile,
  DEFAULT_PROFILE,
} from "@shared/profile";

/**
 * The known servers, and which one is active.
 *
 * The file lives in the app's data folder, not in the repository: these are the
 * machines of whoever uses it. A server only carries a name, an SSH target and
 * the way that machine is driven — never a password nor a key, which remain the
 * business of ~/.ssh/config and the agent.
 */
type Configuration = Required<Pick<ServersConfig, "servers" | "active">> & {
  version: number;
};

/**
 * Version 2 adds a per-server profile. An older configuration has none: it is
 * filled in with the defaults, which describe exactly what the app used to do
 * in hard-coded form — so an older file keeps, to the byte, the behaviour it had.
 */
const VERSION = 2;

function path(): string {
  return join(app.getPath("userData"), "servers.json");
}

const DEFAULTS: Configuration = {
  version: VERSION,
  servers: [
    {
      id: "dev-vps",
      name: "Development server",
      host: "dev-vps",
      profile: DEFAULT_PROFILE,
    },
  ],
  active: "dev-vps",
};

let cache: Configuration | null = null;

function normalise(raw: ServersConfig): Configuration {
  const servers = raw.servers
    .filter((s) => s.id && s.name && s.host)
    .map((s) => ({
      id: s.id,
      name: s.name.slice(0, 60),
      host: s.host.slice(0, 120),
      key: s.key?.slice(0, 300) || undefined,
      profile: cleanProfile(s.profile),
    }));

  const clean: Configuration = {
    version: VERSION,
    servers: servers.length > 0 ? servers : DEFAULTS.servers,
    active: raw.active,
  };
  if (!clean.servers.some((s) => s.id === clean.active)) {
    clean.active = clean.servers[0].id;
  }
  return clean;
}

export function read(): Configuration {
  if (cache) {
    return cache;
  }
  try {
    const raw = readFileSync(path(), "utf8");
    const data = JSON.parse(raw) as ServersConfig;
    if (Array.isArray(data.servers) && data.servers.length > 0) {
      const clean = normalise(data);
      // An older configuration goes back to disk completed, once: otherwise
      // every launch would complete it in memory, and the day the defaults
      // changed it would change with them.
      if ((data.version ?? 1) < VERSION) {
        save(clean);
      }
      cache = clean;
      return clean;
    }
  } catch {
    // First launch, or unreadable file: start from the defaults.
  }
  cache = DEFAULTS;
  return DEFAULTS;
}

function save(config: Configuration): void {
  mkdirSync(dirname(path()), { recursive: true });
  writeFileSync(path(), JSON.stringify(config, null, 2), "utf8");
}

export function write(config: ServersConfig): Configuration {
  const clean = normalise(config);
  save(clean);
  cache = clean;
  return clean;
}

export function active(): Server {
  const config = read();
  return config.servers.find((s) => s.id === config.active) ?? config.servers[0];
}

/** The active server's profile, always complete. */
export function profile(): ServerProfile {
  return cleanProfile(active().profile);
}

/**
 * The hosts declared in ~/.ssh/config, so they can be offered rather than
 * retyped. Wildcard patterns are dropped: "Host *" is not a machine.
 */
export function sshHosts(): string[] {
  const file = join(homedir(), ".ssh", "config");
  if (!existsSync(file)) {
    return [];
  }
  try {
    const lines = readFileSync(file, "utf8").split("\n");
    const hosts: string[] = [];
    for (const line of lines) {
      const found = /^\s*Host\s+(.+)$/i.exec(line);
      if (!found) {
        continue;
      }
      for (const name of found[1].trim().split(/\s+/)) {
        if (!(name.includes("*") || name.includes("?") || hosts.includes(name))) {
          hosts.push(name);
        }
      }
    }
    return hosts;
  } catch {
    return [];
  }
}
