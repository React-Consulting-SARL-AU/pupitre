import type { Registration } from "@shared/contract";
import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { useAppState } from "../stores/state";
import { Button } from "./ui/button";
import { Callout } from "./ui/callout";
import { Field, fieldControlClass } from "./ui/field";

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
      className="animate-[fade-in_180ms_ease-out] rounded-md border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field help="short, unique identifier" label="Name">
          <input
            className={fieldControlClass}
            onChange={(e) => update("name", e.target.value)}
            placeholder="my-site"
            value={fields.name}
          />
        </Field>
        <Field help="relative to the projects root" label="Folder">
          <input
            className={fieldControlClass}
            onChange={(e) => update("dir", e.target.value)}
            placeholder="my-site/apps/web"
            value={fields.dir}
          />
        </Field>
        <Field help="empty = plain folder, no clone" label="Git repository">
          <input
            className={fieldControlClass}
            onChange={(e) => update("repo_url", e.target.value)}
            placeholder="https://example.org/me/my-site.git"
            value={fields.repo_url}
          />
        </Field>
        <Field label="Package manager">
          <select
            className={fieldControlClass}
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
              className={`${fieldControlClass} mt-1`}
              onChange={(e) => update("package_manager", e.target.value)}
              placeholder="the name the server expects"
              value={fields.package_manager}
            />
          )}
        </Field>
        <Field help="127.0.0.1, unless there is a reason" label="Host">
          <input
            className={fieldControlClass}
            onChange={(e) => update("host", e.target.value)}
            value={fields.host}
          />
        </Field>
        <Field help="unique on the machine" label="Port">
          <input
            className={fieldControlClass}
            inputMode="numeric"
            onChange={(e) => update("port", e.target.value)}
            placeholder="4400"
            value={fields.port}
          />
        </Field>
        <Field help="empty = not published publicly" label="Subdomain">
          <input
            className={fieldControlClass}
            onChange={(e) => update("subdomain", e.target.value)}
            placeholder="my-site"
            value={fields.subdomain}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3">
        <Field
          help="run from the folder to start the project"
          label="Start command"
        >
          <input
            className={fieldControlClass}
            onChange={(e) => update("command", e.target.value)}
            placeholder="bun run dev --port 4400"
            value={fields.command}
          />
        </Field>
        <Field
          help={
            derivedInstall
              ? `empty = "${derivedInstall}", derived from the package manager`
              : "empty = derived from the package manager"
          }
          label="Install command"
        >
          <input
            className={fieldControlClass}
            onChange={(e) => update("install", e.target.value)}
            placeholder={derivedInstall || "bun install"}
            value={fields.install}
          />
        </Field>
      </div>

      {origin === "stack" ? (
        <div className="mt-3">
          <Callout tone="warn">
            This row comes from the stack repository. Saving it writes a local
            version that will override it on this machine — the repository
            itself does not move.
          </Callout>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Callout tone="danger">{error}</Callout>
        </div>
      ) : null}

      {log && !error ? (
        <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sunken px-3 py-2 font-data text-[11px] text-ink-2">
          {log}
        </pre>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button icon={FolderPlus} loading={busy} submit variant="inverse">
          Save
        </Button>
        <Button onClick={onCancel} variant="discreet">
          Cancel
        </Button>
        {busy ? (
          <span className="font-data text-[11px] text-ink-3">
            the server is working — this can take a minute
          </span>
        ) : null}
      </div>
    </form>
  );
}
