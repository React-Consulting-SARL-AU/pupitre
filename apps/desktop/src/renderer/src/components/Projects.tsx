import type { Registration } from "@shared/contract";
import { Boxes, GitBranch, Plus, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fieldsFrom, type ProjectFields, ProjectForm } from "./ProjectForm";
import { Button } from "./ui/button";
import { IconButton } from "./ui/icon-button";

/**
 * The project registry, seen and edited from the app.
 *
 * What the server calls "stack" comes from the stack repository and comes back
 * on the next deployment; what is "local" was added on the machine, here or by
 * an agent, and outlives it.
 */
/** The button says what it does here, and the row says why it cannot. */
function removeLabel(p: Registration): string {
  if (p.origin !== "local") {
    return "Comes from the stack repository — remove its row from projects.conf";
  }
  if (p.overrides) {
    return `Restore the repository version of ${p.name}`;
  }
  return `Remove ${p.name} from the registry`;
}

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

  const load = useCallback(async () => {
    setList(await window.pupitre.projects());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        The registry that{" "}
        <code className="font-data text-ink-2">{command}</code> reads. A project
        added here is installed and published by the server, the way it knows
        how, and appears right away — and the same thing can be done from a
        terminal, which lets an agent create a project that will show up here
        with nothing more:
      </p>
      <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-sunken px-3 py-2 font-data text-[11px] text-ink-2">
        {`echo 'my-site|my-site|https://…|bun|127.0.0.1|4400|my-site|bun run dev' \\\n  | ${command} project add`}
      </pre>

      <div className="mt-4 flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-data text-[11px] text-ink-3">
          <Boxes size={13} strokeWidth={1.5} />
          {list ? `${list.length} projects` : "reading…"}
        </span>
        <Button className="ml-auto" icon={RotateCw} onClick={load} size="sm">
          Reload
        </Button>
        <Button icon={Plus} onClick={() => setEditing({})} variant="inverse">
          Add
        </Button>
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
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sunken px-3 py-2 font-data text-[11px] text-ink-2">
          {log}
        </pre>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-md border border-line bg-surface">
        {list?.map((p) => (
          <div
            className="flex items-center gap-3 border-line border-b px-4 py-2.5 last:border-b-0"
            key={p.name}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-[12px] text-ink">
                  {p.name}
                </p>
                {p.origin === "local" ? (
                  <span className="label rounded-sm border border-line-strong px-1.5 py-px text-ink-2">
                    {p.overrides ? "overridden" : "local"}
                  </span>
                ) : null}
                {p.repo ? (
                  <GitBranch
                    className="shrink-0 text-ink-3"
                    size={11}
                    strokeWidth={1.5}
                  />
                ) : null}
                {p.present ? null : (
                  <span className="font-data text-[10px] text-warn">
                    folder missing
                  </span>
                )}
              </div>
              <p className="truncate font-data text-[10px] text-ink-3">
                {p.dir} · {p.package_manager} · {p.host}:{p.port}
                {p.subdomain === "-" ? "" : ` · ${p.subdomain}`}
              </p>
              {/*
                The two commands, spelled out. Reading "pnpm" told you which
                tool, never what it actually ran — and that is the line you go
                looking for when an install did not do what you expected.
              */}
              <p className="truncate font-data text-[10px] text-ink-3">
                <span className="text-ink-4">start</span> {p.command || "—"}
              </p>
              {p.install_effective ? (
                <p className="truncate font-data text-[10px] text-ink-3">
                  <span className="text-ink-4">install</span>{" "}
                  {p.install_effective}
                  {p.install && p.install !== "-" ? null : (
                    <span className="text-ink-4"> (derived)</span>
                  )}
                </p>
              ) : null}
            </div>

            <Button
              onClick={() =>
                setEditing({
                  initial: fieldsFrom(p),
                  origin: p.origin,
                  derivedInstall: p.install_effective,
                })
              }
              size="sm"
            >
              Edit
            </Button>
            <IconButton
              disabled={p.origin !== "local" || busy}
              icon={Trash2}
              label={removeLabel(p)}
              onClick={() => remove(p)}
              variant="danger"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
