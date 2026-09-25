import { agentLine, agentText } from "@renderer/i18n/agent-error";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import type { KeyChoice, ServerDraft, ServerReach } from "@shared/servers";
import {
  FileKey2,
  KeyRound,
  PlugZap,
  Server as ServerIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { type RefusedField, refusedField } from "../../lib/server-add-refusal";
import type { ButtonIcon } from "../ui/button";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Field, fieldAria, fieldControlClass } from "../ui/field";
import { ModeCard, ModeCards } from "../ui/mode-card";
import { panelClass } from "../ui/panel";
import { Select } from "../ui/select";
import { ServerAddKeyFileField } from "./server-add-key-file-field";
import { ServerAddPasswordField } from "./server-add-password-field";
import { ServerAddPortField } from "./server-add-port-field";
import { ServerReachNotice } from "./server-reach-notice";
import { ServerSshNameField } from "./server-ssh-name-field";

type Mode = KeyChoice["mode"];

const DEFAULT_PORT = "22";

const PORT_MAX = 65_535;

const DIGITS = /^\d+$/;

const FIELD = {
  address: "servers.add.address",
  name: "servers.add.name",
  systemHost: "servers.add.systemHost",
  user: "servers.add.user",
};

/** Not `Number.parseInt`, which reads "22abc" as 22. */
export function portOf(typed: string): number | null {
  const text = typed.trim();

  if (!DIGITS.test(text)) {
    return null;
  }

  const port = Number(text);

  return port >= 1 && port <= PORT_MAX ? port : null;
}

function portState(
  mode: Mode,
  typed: string,
  t: ReturnType<typeof useTranslations>
): { portNumber: number | null; portProblem?: string } {
  // An alias of `~/.ssh/config` carries its own port in that file.
  if (mode === "system") {
    return { portNumber: 22 };
  }

  const portNumber = portOf(typed);
  const refused = typed.trim() !== "" && portNumber === null;

  return {
    portNumber,
    ...(refused
      ? { portProblem: t("servers.add.port.problem", { max: PORT_MAX }) }
      : {}),
  };
}

function readyToAdd({
  mode,
  systemHost,
  host,
  user,
  file,
  asksPassword,
  password,
}: {
  mode: Mode;
  systemHost: string;
  host: string;
  user: string;
  file: string;
  asksPassword: boolean;
  password: string;
}): boolean {
  if (mode === "system") {
    return systemHost !== "";
  }

  return (
    host.trim() !== "" &&
    user.trim() !== "" &&
    (mode !== "import" || file !== "") &&
    (!asksPassword || password !== "")
  );
}

const MODES: {
  mode: Mode;
  icon: ButtonIcon;
  title: DictionaryKey;
  detail: DictionaryKey;
}[] = [
  {
    detail: "servers.mode.generate.detail",
    icon: KeyRound,
    mode: "generate",
    title: "servers.mode.generate.title",
  },
  {
    detail: "servers.mode.import.detail",
    icon: FileKey2,
    mode: "import",
    title: "servers.mode.import.title",
  },
  {
    detail: "servers.mode.system.detail",
    icon: ServerIcon,
    mode: "system",
    title: "servers.mode.system.title",
  },
];

/** The password lives only in this component's state, until it is sent. */
export function ServerAddForm({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: AgentError | null;
  onSubmit: (draft: ServerDraft) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();

  const [mode, setMode] = useState<Mode>("generate");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT);
  const [user, setUser] = useState("root");
  const [file, setFile] = useState("");
  const [hosts, setHosts] = useState<string[]>([]);
  const [systemHost, setSystemHost] = useState("");
  const [reach, setReach] = useState<ServerReach | null>(null);
  const [testing, setTesting] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    window.pupitre.sshHosts().then((found) => {
      setHosts(found);
      setSystemHost((current) => current || (found[0] ?? ""));
    });
  }, []);

  // Dev defaults only fill blank fields: they never overwrite what was typed.
  useEffect(() => {
    window.pupitre.devDefaults().then((defaults) => {
      if (!defaults) {
        return;
      }

      const { server } = defaults;

      setName((current) => current || server.name);
      setHost((current) => current || server.host);
      setPort((current) =>
        current === DEFAULT_PORT && server.port ? String(server.port) : current
      );
      setUser((current) => (current === "root" && server.user) || current);
      setPassword((current) => current || server.password);
    });
  }, []);

  async function pickFile() {
    const picked = await window.pupitre.pickKeyFile();

    if (picked) {
      setReach(null);
      setFile(picked);
    }
  }

  function pickMode(picked: Mode) {
    setReach(null);
    setMode(picked);
  }

  function key(): KeyChoice {
    if (mode === "import") {
      return { file, mode: "import" };
    }

    if (mode === "system") {
      return { host: systemHost, mode: "system" };
    }

    return { mode: "generate" };
  }

  const access = reach?.reached ? reach.access : null;
  const asksPassword = access?.access === "password";

  const { portNumber, portProblem } = portState(mode, port, t);

  const refused = refusedField(error, mode, asksPassword);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!submittable) {
      return;
    }

    const typed = password;

    setPassword("");
    onSubmit({
      host: mode === "system" ? systemHost : host,
      key: key(),
      name,
      password: asksPassword ? typed : null,
      port: portNumber,
      slug,
      user,
    });
  }

  async function test() {
    if (portNumber === null) {
      return;
    }

    setTesting(true);
    setReach(
      await window.pupitre.reachServer({
        host: host.trim(),
        keyFile: mode === "import" && file ? file : null,
        port: portNumber,
        user: user.trim(),
      })
    );
    setTesting(false);
  }

  // A reach result describes the address typed then; a new one is untested.
  function retype(set: (value: string) => void) {
    return (value: string) => {
      setReach(null);
      set(value);
    };
  }

  const ready = readyToAdd({
    asksPassword,
    file,
    host,
    mode,
    password,
    systemHost,
    user,
  });

  // A `~/.ssh/config` alias keeps its address in a file this window does not read.
  const testable =
    mode !== "system" &&
    host.trim() !== "" &&
    portNumber !== null &&
    user.trim() !== "";
  const untested = testable && reach === null;
  const submittable = ready && portNumber !== null && !untested;

  return (
    <form className={panelClass("lg")} noValidate onSubmit={submit}>
      <h3 className="font-medium text-ink">{t("servers.addServer")}</h3>

      <div className="mt-5">
        <ModeCards
          label={t("servers.add.modes")}
          onChange={pickMode}
          value={mode}
        >
          {MODES.map((option) => (
            <ModeCard
              detail={t(option.detail)}
              icon={option.icon}
              key={option.mode}
              note={
                option.mode === "generate"
                  ? t("servers.add.recommended")
                  : undefined
              }
              title={t(option.title)}
              value={option.mode}
            />
          ))}
        </ModeCards>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label={t("servers.add.name.label")} name={FIELD.name}>
          <input
            {...fieldAria({ name: FIELD.name })}
            className={fieldControlClass}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("servers.add.name.placeholder")}
            value={name}
          />
        </Field>

        {mode === "system" ? null : (
          <ServerSshNameField
            name="servers.add.sshName"
            onChange={setSlug}
            serverName={name}
            value={slug}
          />
        )}

        {mode === "system" ? (
          <Field
            help={
              hosts.length > 0
                ? t.plural("servers.add.hostsRead", hosts.length)
                : t("servers.add.noHosts")
            }
            label={t("servers.add.systemHost.label")}
            name={FIELD.systemHost}
            required
          >
            <Select
              {...fieldAria({
                help: true,
                name: FIELD.systemHost,
                required: true,
              })}
              kind="data"
              onChange={setSystemHost}
              options={hosts.map((declared) => ({
                label: declared,
                value: declared,
              }))}
              value={systemHost}
            />
          </Field>
        ) : (
          <Field
            help={t("servers.add.address.help")}
            label={t("servers.field.address")}
            name={FIELD.address}
            required
          >
            <input
              {...fieldAria({
                help: true,
                name: FIELD.address,
                required: true,
              })}
              className={fieldControlClass}
              onChange={(e) => retype(setHost)(e.target.value)}
              placeholder="203.0.113.10"
              value={host}
            />
          </Field>
        )}

        {mode === "system" ? null : (
          <>
            <ServerAddPortField
              onChange={retype(setPort)}
              placeholder={DEFAULT_PORT}
              problem={portProblem}
              value={port}
            />

            <Field
              help={t("servers.add.user.help")}
              label={t("servers.add.user.label")}
              name={FIELD.user}
              required
            >
              <input
                {...fieldAria({ help: true, name: FIELD.user, required: true })}
                className={fieldControlClass}
                onChange={(e) => setUser(e.target.value)}
                placeholder={t("servers.add.user.placeholder")}
                value={user}
              />
            </Field>
          </>
        )}
      </div>

      {mode === "import" ? (
        <div className="mt-5">
          <ServerAddKeyFileField
            file={file}
            onPick={pickFile}
            problem={refusalAt(t, error, refused, "keyFile")}
          />
        </div>
      ) : null}

      {reach ? (
        <div className="fade-in mt-5">
          <ServerReachNotice reach={reach} />
        </div>
      ) : null}

      {asksPassword ? (
        <div className="fade-in mt-5 max-w-sm">
          <ServerAddPasswordField
            onChange={setPassword}
            problem={refusalAt(t, error, refused, "password")}
            value={password}
          />
        </div>
      ) : null}

      {error && refused === null ? (
        <div className="mt-5">
          <Callout bare fix={agentText(t, error).fix} tone="danger">
            {agentText(t, error).message}
          </Callout>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {testable ? (
          <Button
            icon={PlugZap}
            loading={testing}
            onClick={test}
            variant={untested ? "inverse" : "default"}
          >
            {reach ? t("servers.add.retest") : t("servers.add.test")}
          </Button>
        ) : null}

        {untested ? null : (
          <Button
            disabled={!submittable}
            loading={busy}
            submit
            variant="inverse"
          >
            {submitLabel(t, {
              busy,
              refused: reach?.reached === false || access?.access === "manual",
              withPassword: asksPassword,
            })}
          </Button>
        )}

        {onCancel ? (
          <Button onClick={onCancel} variant="discreet">
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function refusalAt(
  t: ReturnType<typeof useTranslations>,
  error: AgentError | null,
  refused: RefusedField | null,
  field: RefusedField
): string | undefined {
  return error && refused === field ? agentLine(t, error) : undefined;
}

function submitLabel(
  t: ReturnType<typeof useTranslations>,
  {
    busy,
    refused,
    withPassword,
  }: { busy: boolean; refused: boolean; withPassword: boolean }
): string {
  if (busy) {
    return t(withPassword ? "servers.add.installing" : "servers.add.preparing");
  }

  if (withPassword) {
    return t("servers.add.submitWithPassword");
  }

  return refused ? t("servers.add.submitAnyway") : t("servers.add.submit");
}
