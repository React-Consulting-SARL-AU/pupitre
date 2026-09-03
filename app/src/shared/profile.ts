/**
 * What the app needs to know about a server in order to talk to it.
 *
 * Nothing here is guessed at runtime: the admin command, the log location, the
 * remote editor and the install script differ from one machine to the next, and
 * a constant in the code would mean every machine looks like the first one. The
 * defaults describe the `dev` stack; they do not impose it.
 */
export type ServerProfile = {
  /** The admin command, as it is named over there. */
  command: string;
  /** Where to read a project's log. "{project}" is substituted. */
  logs: string;
  /** The editor name, as the button should say it. */
  editorName: string;
  /**
   * The URL that opens a remote folder in that editor.
   *
   * "{host}", "{root}" and "{repo}" are substituted. Empty: no button — not
   * every machine has an editor that can open over SSH.
   */
  editor: string;
  /** The script to run when nothing is configured. Empty: no shortcut. */
  installer: string;
};

export const DEFAULT_PROFILE: ServerProfile = {
  command: "dev",
  logs: "~/.dev-stack/logs/{project}.log",
  editorName: "Zed",
  editor: "zed://ssh/{host}{root}/{repo}",
  installer: "",
};

/**
 * The editors we know how to open without asking.
 *
 * These are only starting points: the field stays free, and an editor missing
 * from this list is typed in by hand.
 */
export const EDITORS: { name: string; url: string }[] = [
  { name: "Zed", url: "zed://ssh/{host}{root}/{repo}" },
  {
    name: "VS Code",
    url: "vscode://vscode-remote/ssh-remote+{host}{root}/{repo}",
  },
  {
    name: "Cursor",
    url: "cursor://vscode-remote/ssh-remote+{host}{root}/{repo}",
  },
];

/**
 * The command ends up in a remote shell, and the log path in a `tail`. Both come
 * from an interface field: we bound them here, once, rather than hoping nobody
 * ever types a semicolon into them.
 */
const COMMAND_OK = /^[\w.\-/]{1,60}$/;
const PATH_OK = /^[\w.\-/~{}]{1,200}$/;
/** An application scheme, and nothing else: not "file", not "javascript". */
const URL_OK = /^(?!file:|javascript:|data:)[a-z][a-z0-9+.-]{1,20}:\/\/\S{1,200}$/;

export function cleanProfile(raw: unknown): ServerProfile {
  const p = (raw ?? {}) as Partial<ServerProfile>;
  const keep = (
    value: unknown,
    pattern: RegExp,
    fallback: string,
    emptyAllowed = false
  ): string => {
    if (typeof value !== "string") {
      return fallback;
    }
    const clean = value.trim();
    if (clean.length === 0) {
      return emptyAllowed ? "" : fallback;
    }
    return pattern.test(clean) ? clean : fallback;
  };

  return {
    command: keep(p.command, COMMAND_OK, DEFAULT_PROFILE.command),
    logs: keep(p.logs, PATH_OK, DEFAULT_PROFILE.logs),
    editorName:
      typeof p.editorName === "string" && p.editorName.trim().length > 0
        ? p.editorName.trim().slice(0, 30)
        : DEFAULT_PROFILE.editorName,
    editor: keep(p.editor, URL_OK, DEFAULT_PROFILE.editor, true),
    installer: keep(p.installer, PATH_OK, "", true),
  };
}

export function logPath(profile: ServerProfile, project: string): string {
  return profile.logs.replaceAll("{project}", project);
}

export function editorUrl(
  profile: ServerProfile,
  host: string,
  root: string,
  repo: string
): string | null {
  if (!profile.editor) {
    return null;
  }
  const url = profile.editor
    .replaceAll("{host}", host)
    .replaceAll("{root}", root)
    .replaceAll("{repo}", repo);

  return URL_OK.test(url) ? url : null;
}
