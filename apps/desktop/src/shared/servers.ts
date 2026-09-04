/**
 * What the two processes say to each other about servers.
 *
 * The renderer describes a server it would like; the main process is the only
 * one that touches a file, spawns `ssh-keygen` or reads a fingerprint. Nothing
 * here carries a private key: the public half and the line to paste are all the
 * interface ever needs to show.
 *
 * These types belong to the app, not to the agent: a server is a machine this
 * computer knows how to reach, and the agent has never heard of the list.
 */

/**
 * Who owns the configuration that reaches this machine.
 *
 * "app": the address, the port, the account and the key belong to the app,
 * written into its own SSH file. "system": the host is a block of the user's
 * own ~/.ssh/config, and the app writes nothing at all for it.
 */
export type ServerOrigin = "app" | "system";

export type Server = {
  id: string;
  name: string;
  /** An address for an app server, a ~/.ssh/config alias for a system one. */
  host: string;
  port: number;
  /** The remote account. Empty on a system host: its own block says which. */
  user: string;
  origin: ServerOrigin;
  /** The private key in the app's folder. Absent on a system host. */
  keyPath?: string;
  /** The host key recorded on first contact. Absent: never contacted yet. */
  hostFingerprint?: string;
};

export type ServersConfig = {
  /** The file's shape, so we know what to fill in when re-reading it. */
  version?: number;
  servers: Server[];
  active: string | null;
};

/**
 * The three ways to give a key, and they differ only in who owns the file.
 *
 * "generate": the app makes one for this computer, which is the one to prefer.
 * "import": a key the user already had, copied into the app's folder.
 * "system": a host already declared in ~/.ssh/config — the app writes nothing.
 */
export type KeyChoice =
  | { mode: "generate" }
  | { mode: "import"; file: string }
  | { mode: "system"; host: string };

export type ServerDraft = {
  name: string;
  host: string;
  port: number;
  user: string;
  key: KeyChoice;
};

export type ServerAdded = {
  server: Server;
  config: ServersConfig;
  /** The public half, and only that. Null for a host of the system. */
  publicKey: string | null;
  copyId: string | null;
};

export type HostKeyAction = "reinstalled" | "cancel";

/**
 * What the pinned fingerprint says about the machine answering today.
 *
 * "changed" is a refusal, not a warning: the app has no way to tell a
 * reinstallation from someone answering in the server's place, so it stops and
 * hands the choice to the person who knows which it is.
 */
export type HostKeyDecision =
  | { status: "first_contact" }
  | { status: "trusted"; fingerprint: string }
  | {
      status: "changed";
      expected: string;
      observed: string | null;
      message: string;
      fix: string;
      actions: HostKeyAction[];
    };
