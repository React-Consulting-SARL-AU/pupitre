import { agentText } from "@renderer/i18n/agent-error";
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
import type { ButtonIcon } from "../ui/button";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Field, fieldControlClass } from "../ui/field";
import { Label } from "../ui/label";
import { ModeCard } from "../ui/mode-card";
import { panelClass } from "../ui/panel";
import { ServerAddPortField } from "./server-add-port-field";
import { ServerReachNotice } from "./server-reach-notice";

type Mode = KeyChoice["mode"];

const DEFAULT_PORT = "22";

const PORT_MAX = 65_535;

const DIGITS = /^\d+$/;

/**
 * The port as a number, or null when what was typed is not one.
 *
 * `Number.parseInt` would read "22abc" as 22 and "" as NaN; a port is a whole
 * number between 1 and 65535, and nothing else reaches the draft.
 */
export function portOf(typed: string): number | null {
  const text = typed.trim();

  if (!DIGITS.test(text)) {
    return null;
  }

  const port = Number(text);

  return port >= 1 && port <= PORT_MAX ? port : null;
}

/**
 * What the port field stands at: the number the draft will carry, and the
 * refusal under the field once something that is not a port has been typed.
 * An alias of `~/.ssh/config` carries its own port in that file.
 */
function portState(
  mode: Mode,
  typed: string,
  t: ReturnType<typeof useTranslations>
): { portNumber: number | null; portProblem?: string } {
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

/**
 * Adding a server: an address, a port, an account, and who owns the key.
 *
 * The three ways of giving a key are shown side by side rather than hidden in a
 * menu, because choosing between them is the one decision of this screen — and
 * the recommended one says so.
 *
 * The address is knocked on before it is declared: a typo, a closed port or a
 * web server on 22 is worth learning here rather than three screens later. So
 * is the account: the knock says whether something here already opens it,
 * whether it takes a password — asked right here, and gone with the draft —
 * or whether the app will have to hand the line over. The test never blocks —
 * a machine that is down is still worth declaring — but it goes first, and
 * adding waits behind its answer.
 *
 * The password lives in this component's state for as long as it takes to send
 * it, and nowhere else: not in the store, not in the trace, not on a command
 * line.
 */
export function ServerAddForm({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: AgentError | null;
  onSubmit: (draft: ServerDraft) => void;
  /** Absent when there's nothing behind it: a button that leads nowhere. */
  onCancel?: () => void;
}) {
  const t = useTranslations();

  const [mode, setMode] = useState<Mode>("generate");
  const [name, setName] = useState("");
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

  // A development build types the developer's own machine, and only into a
  // field still blank: nothing here ever overwrites what was just typed.
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

  /** A result describes the address that was typed then; a new one is untested. */
  function retype(set: (value: string) => void) {
    return (value: string) => {
      setReach(null);
      set(value);
    };
  }

  const ready =
    mode === "system"
      ? systemHost !== ""
      : host.trim() !== "" &&
        user.trim() !== "" &&
        (mode !== "import" || file) &&
        (!asksPassword || password !== "");

  // An alias of `~/.ssh/config` carries its address in that file, which this
  // window does not read: there is nothing here to knock on.
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

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
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
            onPick={() => pickMode(option.mode)}
            picked={mode === option.mode}
            title={t(option.title)}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label={t("servers.add.name.label")}>
          <input
            className={fieldControlClass}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("servers.add.name.placeholder")}
            value={name}
          />
        </Field>

        {mode === "system" ? (
          <Field
            help={
              hosts.length > 0
                ? t.plural("servers.add.hostsRead", hosts.length)
                : t("servers.add.noHosts")
            }
            label={t("servers.add.systemHost.label")}
          >
            <select
              className={fieldControlClass}
              onChange={(e) => setSystemHost(e.target.value)}
              value={systemHost}
            >
              {hosts.map((declared) => (
                <option key={declared} value={declared}>
                  {declared}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field
            help={t("servers.add.address.help")}
            label={t("servers.field.address")}
          >
            <input
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
            >
              <input
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
          <Label>{t("servers.add.keyFile.label")}</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Button icon={FileKey2} onClick={pickFile}>
              {t("servers.add.pickFile")}
            </Button>
            <span className="min-w-0 truncate font-data text-[12px] text-ink-3">
              {file || t("servers.add.noFile")}
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-5">
          <Callout fix={agentText(t, error).fix} tone="danger">
            {agentText(t, error).message}
          </Callout>
        </div>
      ) : null}

      {reach ? (
        <div className="fade-in mt-5">
          <ServerReachNotice reach={reach} />
        </div>
      ) : null}

      {asksPassword ? (
        <div className="fade-in mt-5 max-w-sm">
          <Field
            help={t("servers.add.password.help")}
            label={t("servers.add.password.label")}
          >
            <input
              autoComplete="off"
              autoFocus
              className={fieldControlClass}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </Field>
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
