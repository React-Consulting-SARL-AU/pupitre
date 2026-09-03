import type { Registration } from "@shared/contract";
import { Boxes, GitBranch, Plus, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type ProjectFields,
  fieldsFrom,
  ProjectForm,
} from "./ProjectForm";

/**
 * The project registry, seen and edited from the app.
 *
 * What the server calls "stack" comes from the stack repository and comes back
 * on the next deployment; what is "local" was added on the machine, here or by
 * an agent, and outlives it.
 */
export function Projects({ command }: { command: string }) {
  const [list, setList] = useState<Registration[] | null>(null);
  // `initial` absent = blank form: that is the component's default.
  const [editing, setEditing] = useState<{
    initial?: ProjectFields;
    origin?: Registration["origin"];
    derivedInstall?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);

  async function load() {
    setList(await window.pupitre.projects());
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(p: Registration) {
    const question = p.overrides
      ? `Restore the repository version of ${p.name}? Your local settings will be lost.`
      : `Remove ${p.name} from the registry? The folder stays.`;
    if (!window.confirm(question)) {
      return;
    }
    setBusy(true);
    const res = await window.pupitre.removeProject(p.name);
    setBusy(false);
    setLog(res.message || null);
    await load();
  }

  return (
    <div>
      <p className="text-ink-3 leading-relaxed">
        The registry that <code className="font-mono text-ink-2">{command}</code>{" "}
        reads. A project added here is installed and published by the server, the
        way it knows how, and appears right away — and the same thing can be done
        from a terminal, which lets an agent create a project that will show up
        here with nothing more:
      </p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[11px] text-ink-3">
        {`echo 'my-site|my-site|https://…|bun|127.0.0.1|4400|my-site|bun run dev' \\\n  | ${command} project add`}
      </pre>

      <div className="mt-4 flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-4">
          <Boxes size={13} />
          {list ? `${list.length} projects` : "reading…"}
        </span>
        <button
          className="transition-soft ml-auto flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-3 hover:border-accent hover:text-accent-strong"
          onClick={load}
          type="button"
        >
          <RotateCw size={12} />
          Reload
        </button>
        <button
          className="transition-soft flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-medium text-[12px] text-base hover:bg-accent-strong"
          onClick={() => setEditing({})}
          type="button"
        >
          <Plus size={13} />
          Add
        </button>
      </div>

      {editing ? (
        <div className="mt-3">
          <ProjectForm
            derivedInstall={editing.derivedInstall}
            initial={editing.initial}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await load();
            }}
            origin={editing.origin}
          />
        </div>
      ) : null}

      {log ? (
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[11px] text-ink-3">
          {log}
        </pre>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        {list?.map((p) => (
          <div
            className="flex items-center gap-3 border-line border-b px-4 py-2.5 last:border-b-0"
            key={p.name}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-[12px]">{p.name}</p>
                {p.origin === "local" ? (
                  <span className="rounded-full bg-accent-veil px-1.5 py-px font-mono text-[9px] text-accent-strong uppercase tracking-wide">
                    {p.overrides ? "overridden" : "local"}
                  </span>
                ) : null}
                {p.repo ? (
                  <GitBranch className="shrink-0 text-ink-4" size={11} />
                ) : null}
                {p.present ? null : (
                  <span className="font-mono text-[10px] text-warn">
                    folder missing
                  </span>
                )}
              </div>
              <p className="truncate font-mono text-[10px] text-ink-4">
                {p.dir} · {p.package_manager} · {p.host}:{p.port}
                {p.subdomain === "-" ? "" : ` · ${p.subdomain}`}
              </p>
              {/*
                The two commands, spelled out. Reading "pnpm" told you which
                tool, never what it actually ran — and that is the line you go
                looking for when an install did not do what you expected.
              */}
              <p className="truncate font-mono text-[10px] text-ink-4">
                <span className="text-ink-3">start</span> {p.command || "—"}
              </p>
              {p.install_effective ? (
                <p className="truncate font-mono text-[10px] text-ink-4">
                  <span className="text-ink-3">install</span>{" "}
                  {p.install_effective}
                  {p.install && p.install !== "-" ? null : (
                    <span className="text-ink-4/70"> (derived)</span>
                  )}
                </p>
              ) : null}
            </div>

            <button
              className="transition-soft shrink-0 rounded-md border border-line px-2 py-1 text-[11px] text-ink-3 hover:border-accent hover:text-accent-strong"
              onClick={() =>
                setEditing({
                  initial: fieldsFrom(p),
                  origin: p.origin,
                  derivedInstall: p.install_effective,
                })
              }
              type="button"
            >
              Edit
            </button>
            <button
              aria-label={
                p.overrides && p.origin === "local"
                  ? `Restore the repository version of ${p.name}`
                  : `Remove ${p.name}`
              }
              className="transition-soft shrink-0 rounded-md border border-line p-1 text-ink-4 hover:border-danger hover:text-danger disabled:opacity-30"
              disabled={p.origin !== "local" || busy}
              onClick={() => remove(p)}
              title={
                p.origin !== "local"
                  ? "Comes from the stack repository — remove its row from projects.conf"
                  : p.overrides
                    ? "Restore the repository version"
                    : "Remove from the registry"
              }
              type="button"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
