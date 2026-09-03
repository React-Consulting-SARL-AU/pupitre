import type { Capabilities, Server, ServersConfig } from "@shared/contract";
import {
  cleanProfile,
  DEFAULT_PROFILE,
  EDITORS,
  type ServerProfile,
} from "@shared/profile";
import { Boxes, ChevronDown, ChevronRight, Server as ServerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Projects } from "./Projects";

/**
 * The servers, and which one we drive.
 *
 * A server is only a name, an SSH target and the way that machine is driven.
 * Neither password nor private key: those remain the business of ~/.ssh/config
 * and the agent, which already know how to keep them. The "key" field only
 * designates a file, for machines that have no block in the system
 * configuration.
 *
 * The "Advanced" block carries what is not the same everywhere: the name of the
 * admin command, the log location, the editor that can open a remote folder. The
 * defaults describe the `dev` stack; changing them needs neither a rebuild nor a
 * file to edit by hand.
 */
const FREE = "__free__";
const NONE = "__none__";
const FIELD =
  "rounded-md border border-line bg-base px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent";

export function Settings({
  config,
  capabilities,
  onSave,
}: {
  config: ServersConfig;
  capabilities: Capabilities | null;
  onSave: (config: ServersConfig) => void;
}) {
  const [section, setSection] = useState<"servers" | "projects">("servers");
  const [draft, setDraft] = useState<ServersConfig>(config);
  const [hosts, setHosts] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const hasRegistry = capabilities?.registry !== false;
  const activeCommand = cleanProfile(
    config.servers.find((s) => s.id === config.active)?.profile
  ).command;

  useEffect(() => {
    window.pupitre.sshHosts().then(setHosts);
  }, []);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  function updateServer(id: string, field: keyof Server, value: string) {
    setDraft((d) => ({
      ...d,
      servers: d.servers.map((s) =>
        s.id === id ? { ...s, [field]: value } : s
      ),
    }));
  }

  function updateProfile(
    id: string,
    field: keyof ServerProfile,
    value: string
  ) {
    setDraft((d) => ({
      ...d,
      servers: d.servers.map((s) =>
        s.id === id
          ? { ...s, profile: { ...cleanProfile(s.profile), [field]: value } }
          : s
      ),
    }));
  }

  function add() {
    const id = `s${Date.now().toString(36)}`;
    setDraft((d) => ({
      ...d,
      servers: [
        ...d.servers,
        {
          id,
          name: "New server",
          host: "",
          profile: { ...DEFAULT_PROFILE },
        },
      ],
    }));
    setExpanded(id);
  }

  function remove(id: string) {
    setDraft((d) => ({
      ...d,
      servers: d.servers.filter((s) => s.id !== id),
      active: d.active === id ? null : d.active,
    }));
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(config);

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-semibold text-xl tracking-tight">Settings</h1>

        <div className="mt-4 mb-5 flex gap-1 border-line border-b">
          <Tab
            active={section === "servers"}
            icon={ServerIcon}
            onClick={() => setSection("servers")}
          >
            Servers
          </Tab>
          {hasRegistry ? (
            <Tab
              active={section === "projects"}
              icon={Boxes}
              onClick={() => setSection("projects")}
            >
              Projects
            </Tab>
          ) : null}
        </div>

        {section === "projects" && hasRegistry ? (
          <Projects command={activeCommand} />
        ) : null}

        <div hidden={section !== "servers"}>
          <p className="text-ink-3 leading-relaxed">
            The app stores neither key nor password. A server points at a host
            from your{" "}
            <code className="font-mono text-ink-2">~/.ssh/config</code> — that is
            what carries the user, the port and the agent.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            {draft.servers.map((server) => {
              const isActive = draft.active === server.id;
              return (
                <div
                  className={`transition-soft rounded-xl border p-4 ${
                    isActive
                      ? "border-accent bg-accent-veil"
                      : "border-line bg-surface"
                  }`}
                  key={server.id}
                >
                  <div className="flex items-center gap-3">
                    <button
                      aria-label={`Drive ${server.name}`}
                      className={`h-4 w-4 shrink-0 rounded-full border-2 transition-soft ${
                        isActive
                          ? "border-accent bg-accent"
                          : "border-line-strong hover:border-accent"
                      }`}
                      onClick={() =>
                        setDraft((d) => ({ ...d, active: server.id }))
                      }
                      type="button"
                    />
                    <input
                      className="min-w-0 flex-1 rounded-md border border-line bg-base px-2.5 py-1.5 font-medium text-[13px] outline-none focus:border-accent"
                      onChange={(e) =>
                        updateServer(server.id, "name", e.target.value)
                      }
                      placeholder="Display name"
                      value={server.name}
                    />
                    <button
                      aria-label={`Remove ${server.name}`}
                      className="shrink-0 rounded-md px-2 py-1 text-ink-4 text-lg leading-none hover:text-danger"
                      onClick={() => remove(server.id)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-2.5 grid gap-2 pl-7 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-4">
                        SSH host
                      </span>
                      <select
                        className={FIELD}
                        onChange={(e) =>
                          updateServer(
                            server.id,
                            "host",
                            e.target.value === FREE ? "" : e.target.value
                          )
                        }
                        value={hosts.includes(server.host) ? server.host : FREE}
                      >
                        {hosts.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                        <option value={FREE}>Another machine…</option>
                      </select>
                      {hosts.includes(server.host) ? null : (
                        <input
                          className={`${FIELD} mt-1`}
                          onChange={(e) =>
                            updateServer(server.id, "host", e.target.value)
                          }
                          placeholder="dev@10.0.0.5"
                          value={server.host}
                        />
                      )}
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-4">
                        Key (optional)
                      </span>
                      <input
                        className={FIELD}
                        onChange={(e) =>
                          updateServer(server.id, "key", e.target.value)
                        }
                        placeholder="the agent handles it"
                        value={server.key ?? ""}
                      />
                    </label>
                  </div>

                  <Advanced
                    onChange={(field, value) =>
                      updateProfile(server.id, field, value)
                    }
                    onToggle={() =>
                      setExpanded((e) => (e === server.id ? null : server.id))
                    }
                    open={expanded === server.id}
                    profile={cleanProfile(server.profile)}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              className="transition-soft rounded-lg border border-line-strong px-3.5 py-2 text-[12px] hover:border-accent hover:text-accent-strong"
              onClick={add}
              type="button"
            >
              Add a server
            </button>
            <button
              className="transition-soft rounded-lg bg-accent px-3.5 py-2 font-semibold text-[12px] text-base hover:bg-accent-strong disabled:opacity-35"
              disabled={!changed}
              onClick={() => onSave(draft)}
              type="button"
            >
              Save
            </button>
            {changed ? (
              <span className="font-mono text-[11px] text-ink-4">
                switching server closes the open terminals
              </span>
            ) : null}
          </div>

          <p className="mt-6 font-mono text-[11px] text-ink-4">
            {hosts.length > 0
              ? `${hosts.length} hosts read from ~/.ssh/config`
              : "No host in ~/.ssh/config — type a machine by hand"}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * What differs from one machine to another, and that nothing lets us guess.
 *
 * Collapsed by default: the defaults are enough for the starter stack, and
 * someone who changed nothing has nothing to read here.
 */
function Advanced({
  profile,
  open,
  onToggle,
  onChange,
}: {
  profile: ServerProfile;
  open: boolean;
  onToggle: () => void;
  onChange: (field: keyof ServerProfile, value: string) => void;
}) {
  const known = EDITORS.find((e) => e.url === profile.editor);
  const choice = profile.editor ? (known ? known.name : FREE) : NONE;

  function pickEditor(value: string) {
    if (value === NONE) {
      onChange("editor", "");
      return;
    }
    if (value === FREE) {
      onChange("editor", profile.editor || "myeditor://{host}{root}/{repo}");
      return;
    }
    const found = EDITORS.find((e) => e.name === value);
    if (found) {
      onChange("editorName", found.name);
      onChange("editor", found.url);
    }
  }

  return (
    <div className="mt-2.5 pl-7">
      <button
        className="transition-soft flex items-center gap-1 font-mono text-[10px] text-ink-4 uppercase tracking-[0.08em] hover:text-accent-strong"
        onClick={onToggle}
        type="button"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Advanced
      </button>

      {open ? (
        <div className="mt-2 grid animate-[fade-in_160ms_ease-out] gap-2 sm:grid-cols-2">
          <Setting
            help="what the app calls on the server"
            label="Command"
          >
            <input
              className={FIELD}
              onChange={(e) => onChange("command", e.target.value)}
              placeholder="dev"
              value={profile.command}
            />
          </Setting>
          <Setting help='"{project}" is substituted' label="Logs">
            <input
              className={FIELD}
              onChange={(e) => onChange("logs", e.target.value)}
              placeholder="~/.dev-stack/logs/{project}.log"
              value={profile.logs}
            />
          </Setting>
          <Setting
            help="opens the remote folder from a project page"
            label="Editor"
          >
            <select
              className={FIELD}
              onChange={(e) => pickEditor(e.target.value)}
              value={choice}
            >
              {EDITORS.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
              <option value={NONE}>None</option>
              <option value={FREE}>Other…</option>
            </select>
            {choice === FREE ? (
              <>
                <input
                  className={`${FIELD} mt-1`}
                  onChange={(e) => onChange("editorName", e.target.value)}
                  placeholder="Button label"
                  value={profile.editorName}
                />
                <input
                  className={`${FIELD} mt-1`}
                  onChange={(e) => onChange("editor", e.target.value)}
                  placeholder="myeditor://{host}{root}/{repo}"
                  value={profile.editor}
                />
              </>
            ) : null}
          </Setting>
          <Setting
            help="run from this computer when nothing is configured"
            label="Install script"
          >
            <input
              className={FIELD}
              onChange={(e) => onChange("installer", e.target.value)}
              placeholder="none"
              value={profile.installer}
            />
          </Setting>
        </div>
      ) : null}
    </div>
  );
}

function Setting({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-4">
        {label}
      </span>
      {children}
      <span className="text-[11px] text-ink-4">{help}</span>
    </label>
  );
}

function Tab({
  children,
  active,
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon: typeof ServerIcon;
}) {
  return (
    <button
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] transition-colors ${
        active
          ? "border-accent font-medium text-accent-strong"
          : "border-transparent text-ink-3 hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon size={13} />
      {children}
    </button>
  );
}
