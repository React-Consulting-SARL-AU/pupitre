export type MenuCommand =
  | "palette"
  | "preferences"
  | "new-terminal"
  | "new-agent"
  | "shortcuts"
  | "sign-out";

/** Checked by the main process: a known server, a project its agent declared, the account callback's flag alone. */
export type DeepLink =
  | { kind: "server"; serverId: string }
  | { kind: "project"; serverId: string; name: string }
  | { kind: "account"; query: { device?: "approved" } };
