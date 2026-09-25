import type { Manifest } from "@pupitre/shared/catalog";
import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Field, proseControlClass } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import { forgetScope, useConnections } from "@renderer/stores/connections";
import { type ReactNode, useEffect, useState } from "react";
import { ConnectionAccountChoice } from "./connection-account-choice";
import { ConnectionConnected } from "./connection-connected";
import type { ConnectionDescriptor } from "./connection-descriptors";

export function ConnectionCard({
  connection,
  compact = false,
  installed = [],
  manifests = null,
  serverName = null,
  status,
}: {
  connection: ConnectionDescriptor;
  compact?: boolean;
  installed?: readonly string[];
  /** Null while the catalogue is unread: forgetting then cannot name the modules it affects. */
  manifests?: readonly Manifest[] | null;
  serverName?: string | null;
  status?: ReactNode;
}) {
  const t = useTranslations();

  const state = useConnections((store) => store.state[connection.kind]);
  const busy = useConnections((store) => store.busy === connection.kind);
  const problem = useConnections((store) => store.problems[connection.kind]);
  const health = useConnections((store) => store.health[connection.kind]);
  const accounts = useConnections((store) => store.choices[connection.kind]);
  const read = useConnections((store) => store.read);
  const connect = useConnections((store) => store.connect);
  const dropChoice = useConnections((store) => store.dropChoice);
  const forget = useConnections((store) => store.forget);
  const verify = useConnections((store) => store.verify);

  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    read();
  }, [read]);

  if (state.status === "connected") {
    return (
      <ConnectionConnected
        busy={busy}
        connection={connection}
        health={health}
        onForget={() => forget(connection.kind)}
        onVerify={() => verify(connection.kind)}
        scope={forgetScope(connection.kind, installed, manifests)}
        serverName={serverName}
        state={state}
        status={status}
      />
    );
  }

  const ready =
    token.trim() !== "" && (accounts === undefined || accountId !== null);

  async function submit(): Promise<void> {
    if (await connect(connection.kind, token, accountId ?? undefined)) {
      setToken("");
      setAccountId(null);
    }
  }

  function retype(value: string): void {
    setToken(value);

    if (accounts) {
      dropChoice(connection.kind);
      setAccountId(null);
    }
  }

  const name = `connections.${connection.kind}.token`;

  return (
    <div
      className="flex flex-col gap-3"
      data-connected="false"
      data-connection={connection.kind}
    >
      {status}

      {compact || !connection.intro ? null : (
        <p className="text-ink-3 leading-relaxed">{t(connection.intro)}</p>
      )}

      <Field
        help={t(connection.help)}
        hint={{ text: t(connection.hint), url: connection.url }}
        label={t(connection.label)}
        name={name}
        required
      >
        <input
          className={proseControlClass}
          id={name}
          onChange={(event) => retype(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && ready) {
              submit();
            }
          }}
          type="password"
          value={token}
        />
      </Field>

      {accounts ? (
        <ConnectionAccountChoice
          accounts={accounts}
          chosen={accountId}
          kind={connection.kind}
          onChoose={setAccountId}
        />
      ) : null}

      {problem ? <ErrorNotice bare error={problem} /> : null}

      <div>
        <Button
          disabled={!ready}
          loading={busy}
          onClick={() => submit()}
          size="sm"
        >
          {t("connections.save")}
        </Button>
      </div>
    </div>
  );
}
