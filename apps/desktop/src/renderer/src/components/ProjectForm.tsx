import type { Registration } from "@shared/contract";
import { FolderPlus, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useAppState } from "../stores/state";

/**
 * A registry row, as a form.
 *
 * The same one serves to register a project from the settings and to fix the one
 * you are looking at from its own page. Two forms would have diverged at the
 * first field added.
 *
 * Writing a row with the same name as one coming from the stack repository
 * overrides it locally: that is what lets you fix a port without touching the
 * repository, and what the warning says when that is the case.
 *
 * The package managers offered when the server announces none are only a
 * starting point: the server can give its own, and the field accepts whatever is
 * typed anyway — it is the server that knows what it can run, not this list.
 */
const PACKAGE_MANAGERS = [
  "bun",
  "pnpm",
  "npm",
  "yarn",
  "gradle",
  "service",
  "none",
];

const FREE = "__free__";

const EMPTY = {
  name: "",
  dir: "",
  repo_url: "",
  package_manager: "bun",
  host: "127.0.0.1",
  port: "",
  subdomain: "",
  command: "",
  install: "",
};

export type ProjectFields = typeof EMPTY;

export function fieldsFrom(p: Registration): ProjectFields {
  return {
    name: p.name,
    dir: p.dir,
    repo_url: p.repo_url === "-" ? "" : p.repo_url,
    package_manager: p.package_manager,
    host: p.host,
    port: String(p.port),
    subdomain: p.subdomain === "-" ? "" : p.subdomain,
    command: p.command,
    install: p.install === "-" ? "" : p.install,
  };
}

const FIELD =
  "rounded-md border border-line bg-base px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent";

function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] text-ink-4 uppercase tracking-[0.08em]">
        {label}
      </span>
      {children}
      {help ? <span className="text-[11px] text-ink-4">{help}</span> : null}
    </label>
  );
}

export function ProjectForm({
  initial = EMPTY,
  origin,
  derivedInstall,
  onSaved,
  onCancel,
}: {
  initial?: ProjectFields;
  /** Where the edited row comes from, to warn about what gets overridden. */
  origin?: Registration["origin"];
  /**
   * What the server would run if the install field stays empty. Shown as the
   * placeholder rather than described in prose: the answer to "how does it
   * install my dependencies" should be legible in the field itself.
   */
  derivedInstall?: string;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const announced = useAppState((s) => s.snapshot?.package_managers);
  const managers = announced?.length ? announced : PACKAGE_MANAGERS;

  const [fields, setFields] = useState<ProjectFields>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);

  function update(key: keyof ProjectFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setLog(null);

    const res = await window.pupitre.writeProject(fields);
    setBusy(false);
    setLog(res.message || null);

    if (res.ok) {
      await onSaved();
    } else {
      setError(res.message || "the server refused the row");
    }
  }

  return (
    <form
      className="animate-[fade-in_180ms_ease-out] rounded-xl border border-line-strong bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Row help="short, unique identifier" label="Name">
          <input
            className={FIELD}
            onChange={(e) => update("name", e.target.value)}
            placeholder="my-site"
            value={fields.name}
          />
        </Row>
        <Row help="relative to the projects root" label="Folder">
          <input
            className={FIELD}
            onChange={(e) => update("dir", e.target.value)}
            placeholder="my-site/apps/web"
            value={fields.dir}
          />
        </Row>
        <Row help="empty = plain folder, no clone" label="Git repository">
          <input
            className={FIELD}
            onChange={(e) => update("repo_url", e.target.value)}
            placeholder="https://example.org/me/my-site.git"
            value={fields.repo_url}
          />
        </Row>
        <Row label="Package manager">
          <select
            className={FIELD}
            onChange={(e) =>
              update(
                "package_manager",
                e.target.value === FREE ? "" : e.target.value
              )
            }
            value={
              managers.includes(fields.package_manager)
                ? fields.package_manager
                : FREE
            }
          >
            {managers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={FREE}>Other…</option>
          </select>
          {managers.includes(fields.package_manager) ? null : (
            <input
              className={`${FIELD} mt-1`}
              onChange={(e) => update("package_manager", e.target.value)}
              placeholder="the name the server expects"
              value={fields.package_manager}
            />
          )}
        </Row>
        <Row help="127.0.0.1, unless there is a reason" label="Host">
          <input
            className={FIELD}
            onChange={(e) => update("host", e.target.value)}
            value={fields.host}
          />
        </Row>
        <Row help="unique on the machine" label="Port">
          <input
            className={FIELD}
            inputMode="numeric"
            onChange={(e) => update("port", e.target.value)}
            placeholder="4400"
            value={fields.port}
          />
        </Row>
        <Row help="empty = not published publicly" label="Subdomain">
          <input
            className={FIELD}
            onChange={(e) => update("subdomain", e.target.value)}
            placeholder="my-site"
            value={fields.subdomain}
          />
        </Row>
      </div>

      <div className="mt-3 grid gap-3">
        <Row
          help="run from the folder to start the project"
          label="Start command"
        >
          <input
            className={FIELD}
            onChange={(e) => update("command", e.target.value)}
            placeholder="bun run dev --port 4400"
            value={fields.command}
          />
        </Row>
        <Row
          help={
            derivedInstall
              ? `empty = "${derivedInstall}", derived from the package manager`
              : "empty = derived from the package manager"
          }
          label="Install command"
        >
          <input
            className={FIELD}
            onChange={(e) => update("install", e.target.value)}
            placeholder={derivedInstall || "bun install"}
            value={fields.install}
          />
        </Row>
      </div>

      {origin === "stack" ? (
        <p className="mt-3 flex items-start gap-2 text-[11px] text-ink-4">
          <TriangleAlert className="mt-px shrink-0 text-warn" size={12} />
          This row comes from the stack repository. Saving it writes a local
          version that will override it on this machine — the repository itself
          does not move.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
          <TriangleAlert className="mt-px shrink-0" size={13} />
          {error}
        </p>
      ) : null}

      {log && !error ? (
        <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-[11px] text-ink-3">
          {log}
        </pre>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 font-medium text-[12px] text-base transition-soft hover:bg-accent-strong disabled:opacity-40"
          disabled={busy}
          type="submit"
        >
          {busy ? (
            <Loader2 className="animate-spin" size={13} />
          ) : (
            <FolderPlus size={13} />
          )}
          Save
        </button>
        <button
          className="rounded-lg border border-line px-3 py-2 text-[12px] text-ink-3 transition-soft hover:border-line-strong"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        {busy ? (
          <span className="font-mono text-[11px] text-ink-4">
            the server is working — this can take a minute
          </span>
        ) : null}
      </div>
    </form>
  );
}
