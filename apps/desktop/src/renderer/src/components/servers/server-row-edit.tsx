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
import { ServerSshNameField } from "./server-ssh-name-field";

const FIELDS = ["host", "port", "user", "slug"] as const;

type FieldName = (typeof FIELDS)[number];

const REFUSED: Record<string, FieldName> = {
  "refusal.setup.host": "host",
  "refusal.setup.port": "port",
  "refusal.setup.sshName": "slug",
  "refusal.setup.sshNameTaken": "slug",
  "refusal.setup.user": "user",
};

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
  /** False for a system host: its address belongs to `~/.ssh/config`. */
  addressEditable?: boolean;
  onSubmit: (changes: ServerChanges) => void;
  /** Applies on the spot, apart from the address changes. */
  onRename?: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const [name, setName] = useState(server.name);
  const [slug, setSlug] = useState(server.slug ?? "");
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
    ...(slug.trim() === (server.slug ?? "") ? {} : { slug: slug.trim() }),
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
        <ServerSshNameField
          disabled={busy}
          name={`${prefix}-slug`}
          onChange={setSlug}
          problem={problemOf("slug")}
          serverName={name}
          value={slug}
        />
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
        <p className="text-danger text-small leading-relaxed" role="alert">
          {said.message}
          {said.fix ? (
            <span className="block text-ink-3">{said.fix}</span>
          ) : null}
        </p>
      ) : null}

      {addressEditable ? (
        <p className="text-ink-3 text-small leading-relaxed">
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
