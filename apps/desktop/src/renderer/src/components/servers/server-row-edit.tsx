import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import type { Server, ServerChanges } from "@shared/servers";
import { Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "../ui/button";
import {
  Field,
  fieldAria,
  fieldControlClass,
  proseControlClass,
} from "../ui/field";

/**
 * The address, the port and the account of a server, changed where they are read.
 *
 * The form sends only what changed, and the main process is the one that
 * checks each value before it becomes a line of the SSH file: a refusal comes
 * back naming its field, and the field carries it. Nothing here is written
 * on this side.
 */

const FIELDS = ["host", "port", "user"] as const;

type FieldName = (typeof FIELDS)[number];

const REFUSED: Record<string, FieldName> = {
  "refusal.setup.host": "host",
  "refusal.setup.port": "port",
  "refusal.setup.user": "user",
};

/** The field a refusal of the main process points at, or none for a general one. */
export function refusedField(error: AgentError | null): FieldName | null {
  return error?.phrase ? (REFUSED[error.phrase.id] ?? null) : null;
}

export function ServerRowEdit({
  server,
  busy,
  error,
  addressEditable = true,
  onSubmit,
  onRename,
  onCancel,
}: {
  server: Server;
  busy: boolean;
  error: AgentError | null;
  /** The address is the app's to change; a system host keeps its own. */
  addressEditable?: boolean;
  onSubmit: (changes: ServerChanges) => void;
  /** The name is the app's alone: it changes on the spot, whatever the address does. */
  onRename?: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const [name, setName] = useState(server.name);
  const [host, setHost] = useState(server.host);
  const [port, setPort] = useState(String(server.port));
  const [user, setUser] = useState(server.user);

  const wrong = refusedField(error);
  const said = error ? agentText(t, error) : null;
  const problemOf = (field: FieldName) =>
    wrong === field && said ? [said.message, said.fix].join(" ").trim() : "";

  const changes: ServerChanges = {
    ...(host.trim() === server.host ? {} : { host: host.trim() }),
    ...(Number(port) === server.port ? {} : { port: Number(port) }),
    ...(user.trim() === server.user ? {} : { user: user.trim() }),
  };
  const renamed = name.trim() !== "" && name.trim() !== server.name;
  const changed = Object.keys(changes).length > 0;

  function submit(event: FormEvent): void {
    event.preventDefault();

    if (busy) {
      return;
    }

    if (renamed) {
      onRename?.(name.trim());
    }

    if (changed) {
      onSubmit(changes);
    } else if (renamed) {
      onCancel();
    }
  }

  const prefix = `server-edit-${server.id}`;

  return (
    <form
      className="fade-in mt-5 flex flex-col gap-4 rounded-sm border border-line bg-sunken p-4"
      data-server-edit={server.id}
      onSubmit={submit}
    >
      {onRename ? (
        <Field label={t("servers.field.name")} name={`${prefix}-name`} required>
          <input
            {...fieldAria({ name: `${prefix}-name`, required: true })}
            autoComplete="off"
            className={proseControlClass}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            spellCheck={false}
            value={name}
          />
        </Field>
      ) : null}

      {addressEditable ? (
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
          <Field
            label={t("servers.field.host")}
            name={`${prefix}-host`}
            problem={problemOf("host")}
            required
          >
            <input
              {...fieldAria({
                name: `${prefix}-host`,
                problem: wrong === "host",
                required: true,
              })}
              autoComplete="off"
              className={fieldControlClass}
              disabled={busy}
              onChange={(event) => setHost(event.target.value)}
              spellCheck={false}
              value={host}
            />
          </Field>
          <Field
            label={t("servers.field.port")}
            name={`${prefix}-port`}
            problem={problemOf("port")}
            required
          >
            <input
              {...fieldAria({
                name: `${prefix}-port`,
                problem: wrong === "port",
                required: true,
              })}
              className={fieldControlClass}
              disabled={busy}
              inputMode="numeric"
              max={65_535}
              min={1}
              onChange={(event) => setPort(event.target.value)}
              type="number"
              value={port}
            />
          </Field>
          <Field
            label={t("servers.field.user")}
            name={`${prefix}-user`}
            problem={problemOf("user")}
            required
          >
            <input
              {...fieldAria({
                name: `${prefix}-user`,
                problem: wrong === "user",
                required: true,
              })}
              autoComplete="off"
              className={fieldControlClass}
              disabled={busy}
              onChange={(event) => setUser(event.target.value)}
              spellCheck={false}
              value={user}
            />
          </Field>
        </div>
      ) : null}

      {said && wrong === null ? (
        <p className="text-[12px] text-danger leading-relaxed" role="alert">
          {said.message}
          {said.fix ? (
            <span className="block text-ink-3">{said.fix}</span>
          ) : null}
        </p>
      ) : null}

      {addressEditable ? (
        <p className="text-[12px] text-ink-3 leading-relaxed">
          {t("servers.edit.note")}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          disabled={!(changed || renamed)}
          icon={Check}
          loading={busy}
          size="sm"
          submit
          variant="inverse"
        >
          {t("servers.edit.save")}
        </Button>
        <Button disabled={busy} onClick={onCancel} size="sm" variant="discreet">
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
