import type { DevDefaults } from "@shared/dev";

/**
 * The machine a developer installs ten times a day, read from their own
 * environment rather than typed each time.
 *
 * Nothing here exists in a packaged build: it answers null, and the screens
 * keep their blank fields. The password is the throwaway machine's, and it
 * travels the way a typed one does — once, to the key install, and nowhere
 * else.
 */

const PREFIX = "PUPITRE_DEV_";

type Env = Record<string, string | undefined>;

function reader(env: Env): (name: string) => string {
  return (name) => (env[PREFIX + name] ?? "").trim();
}

function portOf(value: string): number | null {
  const port = Number.parseInt(value, 10);

  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
}

/** The identity the core module asks for, under the keys its manifest declares. */
function fieldsOf(read: (name: string) => string): DevDefaults["fields"] {
  const identity: Record<string, string> = {};

  if (read("GIT_NAME")) {
    identity.git_name = read("GIT_NAME");
  }

  if (read("GIT_EMAIL")) {
    identity.git_email = read("GIT_EMAIL");
  }

  return Object.keys(identity).length > 0 ? { "core.system": identity } : {};
}

export function devDefaultsFrom(
  env: Env,
  packaged: boolean
): DevDefaults | null {
  if (packaged) {
    return null;
  }

  const read = reader(env);

  return {
    fields: fieldsOf(read),
    server: {
      host: read("SERVER_HOST"),
      name: read("SERVER_NAME"),
      password: read("SERVER_PASSWORD"),
      port: portOf(read("SERVER_PORT")),
      user: read("SERVER_USER"),
    },
  };
}
