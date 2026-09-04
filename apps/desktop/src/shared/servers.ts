import type { Server, ServersConfig } from "./contract";

/**
 * What the two processes say to each other about servers.
 *
 * The renderer describes a server it would like; the main process is the only
 * one that touches a file, spawns `ssh-keygen` or reads a fingerprint. Nothing
 * here carries a private key: the public half and the line to paste are all the
 * interface ever needs to show.
 */

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
