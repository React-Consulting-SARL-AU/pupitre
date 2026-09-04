import type { Capabilities, Server, ServersConfig } from "@shared/contract";
import {
  cleanProfile,
  DEFAULT_PROFILE,
  EDITORS,
  type ServerProfile,
} from "@shared/profile";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Palette,
  Plus,
  Server as ServerIcon,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  THEME_PREFERENCES,
  type ThemePreference,
  useTheme,
} from "../stores/theme";
import { Projects } from "./Projects";
import { Button } from "./ui/button";
import { Field, fieldControlClass } from "./ui/field";
import { IconButton } from "./ui/icon-button";
import { Label } from "./ui/label";
import { PageHeader } from "./ui/page-header";
import { StatusDot } from "./ui/status-dot";

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

const THEME_LABEL: Record<ThemePreference, string> = {
  system: "Follow the system",
  light: "Light",
  dark: "Dark",
};

type Section = "servers" | "projects" | "appearance";

/** A known editor by name, an unknown URL as "other", nothing as "none". */
function editorChoice(profile: ServerProfile): string {
  if (!profile.editor) {
    return NONE;
  }
  const known = EDITORS.find((e) => e.url === profile.editor);
  return known ? known.name : FREE;
}

export function Settings({
  config,
  capabilities,
  onSave,
}: {
  config: ServersConfig;
  capabilities: Capabilities | null;
  onSave: (config: ServersConfig) => void;
}) {
  const [section, setSection] = useState<Section>("servers");
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
        <PageHeader title="Settings" />

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
          <Tab
            active={section === "appearance"}
            icon={Palette}
            onClick={() => setSection("appearance")}
          >
            Appearance
          </Tab>
        </div>

        {section === "projects" && hasRegistry ? (
          <Projects command={activeCommand} />
        ) : null}

        {section === "appearance" ? <Appearance /> : null}

        <div hidden={section !== "servers"}>
          <p className="text-ink-3 leading-relaxed">
            The app stores neither key nor password. A server points at a host
            from your{" "}
            <code className="font-data text-ink-2">~/.ssh/config</code> — that
            is what carries the user, the port and the agent.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            {draft.servers.map((server) => {
              const isActive = draft.active === server.id;
              return (
                <div
                  className={`rounded-md border p-4 transition-soft ${
                    isActive
                      ? "border-line-strong bg-raised"
                      : "border-line bg-surface"
                  }`}
                  key={server.id}
                >
                  <div className="flex items-center gap-3">
                    <button
                      aria-current={isActive}
                      aria-label={`Drive ${server.name}`}
                      className="shrink-0 rounded-sm p-0.5 text-ink transition-soft"
                      onClick={() =>
                        setDraft((d) => ({ ...d, active: server.id }))
                      }
                      type="button"
                    >
                      <StatusDot
                        shape={isActive ? "filled" : "empty"}
                        size={13}
                      />
                    </button>
                    <input
                      className={`min-w-0 flex-1 ${fieldControlClass}`}
                      onChange={(e) =>
                        updateServer(server.id, "name", e.target.value)
                      }
                      placeholder="Display name"
                      value={server.name}
                    />
                    <IconButton
                      icon={X}
                      label={`Remove ${server.name}`}
                      onClick={() => remove(server.id)}
                      variant="danger"
                    />
                  </div>

                  <div className="mt-2.5 grid gap-2 pl-7 sm:grid-cols-2">
                    <Field label="SSH host">
                      <select
                        className={fieldControlClass}
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
                          className={`${fieldControlClass} mt-1`}
                          onChange={(e) =>
                            updateServer(server.id, "host", e.target.value)
                          }
                          placeholder="dev@10.0.0.5"
                          value={server.host}
                        />
                      )}
                    </Field>
                    <Field label="Key (optional)">
                      <input
                        className={fieldControlClass}
                        onChange={(e) =>
                          updateServer(server.id, "key", e.target.value)
                        }
                        placeholder="the agent handles it"
                        value={server.key ?? ""}
                      />
                    </Field>
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
            <Button icon={Plus} onClick={add}>
              Add a server
            </Button>
            <Button
              disabled={!changed}
              onClick={() => onSave(draft)}
              variant="inverse"
            >
              Save
            </Button>
            {changed ? (
              <span className="font-data text-[11px] text-ink-3">
                switching server closes the open terminals
              </span>
            ) : null}
          </div>

          <p className="mt-6 font-data text-[11px] text-ink-3">
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
 * Light, dark, or whatever the system says.
 *
 * The choice lands on `<html data-theme>`, which is what the tokens of
 * `@pupitre/design` key off: the window, the panels and the open terminals turn
 * over on the spot, with nothing reloaded and no session lost.
 */
function Appearance() {
  const preference = useTheme((t) => t.preference);
  const resolved = useTheme((t) => t.resolved);
  const setPreference = useTheme((t) => t.setPreference);

  return (
    <div className="max-w-sm">
      <p className="text-ink-3 leading-relaxed">
        The interface is monochrome by design: no accent colour, and colour only
        for the state of things. The theme applies at once, terminals included.
      </p>

      <div className="mt-4">
        <Field help={`currently showing the ${resolved} theme`} label="Theme">
          <select
            className={fieldControlClass}
            onChange={(e) => setPreference(e.target.value as ThemePreference)}
            value={preference}
          >
            {THEME_PREFERENCES.map((option) => (
              <option key={option} value={option}>
                {THEME_LABEL[option]}
              </option>
            ))}
          </select>
        </Field>
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
  const choice = editorChoice(profile);

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
        className="flex items-center gap-1 rounded-sm text-ink-3 transition-soft hover:text-ink"
        onClick={onToggle}
        type="button"
      >
        {open ? (
          <ChevronDown size={12} strokeWidth={1.5} />
        ) : (
          <ChevronRight size={12} strokeWidth={1.5} />
        )}
        <Label>Advanced</Label>
      </button>

      {open ? (
        <div className="mt-2 grid animate-[fade-in_160ms_ease-out] gap-2 sm:grid-cols-2">
          <Field help="what the app calls on the server" label="Command">
            <input
              className={fieldControlClass}
              onChange={(e) => onChange("command", e.target.value)}
              placeholder="dev"
              value={profile.command}
            />
          </Field>
          <Field help='"{project}" is substituted' label="Logs">
            <input
              className={fieldControlClass}
              onChange={(e) => onChange("logs", e.target.value)}
              placeholder="~/.dev-stack/logs/{project}.log"
              value={profile.logs}
            />
          </Field>
          <Field
            help="opens the remote folder from a project page"
            label="Editor"
          >
            <select
              className={fieldControlClass}
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
                  className={`${fieldControlClass} mt-1`}
                  onChange={(e) => onChange("editorName", e.target.value)}
                  placeholder="Button label"
                  value={profile.editorName}
                />
                <input
                  className={`${fieldControlClass} mt-1`}
                  onChange={(e) => onChange("editor", e.target.value)}
                  placeholder="myeditor://{host}{root}/{repo}"
                  value={profile.editor}
                />
              </>
            ) : null}
          </Field>
          <Field
            help="run from this computer when nothing is configured"
            label="Install script"
          >
            <input
              className={fieldControlClass}
              onChange={(e) => onChange("installer", e.target.value)}
              placeholder="none"
              value={profile.installer}
            />
          </Field>
        </div>
      ) : null}
    </div>
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
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] transition-soft ${
        active
          ? "border-ink font-medium text-ink"
          : "border-transparent text-ink-3 hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon size={13} strokeWidth={1.5} />
      {children}
    </button>
  );
}
