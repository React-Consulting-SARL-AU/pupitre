import type { Manifest } from "@pupitre/shared/catalog";
import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Field, proseControlClass } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import { forgetScope, useConnections } from "@renderer/stores/connections";
import { useEffect, useState } from "react";
import { ConnectionConnected } from "./connection-connected";
import type { ConnectionDescriptor } from "./connection-descriptors";

/**
 * One third-party account, given once and weighed at once.
 *
 * The token goes to the system keychain and never comes back down into the
 * window, so this can say an account is connected and under what name, never
 * with what. Nothing here asks for an identifier: what the token opens is read
 * from the provider, which is also how a bad token is caught at the fifth
 * second rather than at the eighth step. A provider with nothing to answer says
 * the token is held, and the server tells the rest at install.
 */
export function ConnectionCard({
  connection,
  compact = false,
  installed = [],
  manifests = null,
  serverName = null,
}: {
  connection: ConnectionDescriptor;
  compact?: boolean;
  /** The modules the active server runs, so forgetting names what it takes away. */
  installed?: readonly string[];
  /** The catalogue's manifests, when they have been read; null says nothing can be named. */
  manifests?: readonly Manifest[] | null;
  serverName?: string | null;
}) {
  const t = useTranslations();

  const state = useConnections((store) => store.state[connection.kind]);
  const busy = useConnections((store) => store.busy);
  const problem = useConnections((store) => store.problem);
  const health = useConnections((store) => store.health[connection.kind]);
  const read = useConnections((store) => store.read);
  const connect = useConnections((store) => store.connect);
  const forget = useConnections((store) => store.forget);
  const verify = useConnections((store) => store.verify);

  const [token, setToken] = useState("");

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
      />
    );
  }

  async function submit(): Promise<void> {
    if (await connect(connection.kind, token)) {
      setToken("");
    }
  }

  const name = `connections.${connection.kind}.token`;

  return (
    <div
      className="flex flex-col gap-3"
      data-connected="false"
      data-connection={connection.kind}
    >
      {compact ? null : (
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
          onChange={(event) => setToken(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && token.trim() !== "") {
              submit();
            }
          }}
          type="password"
          value={token}
        />
      </Field>

      {problem ? <ErrorNotice error={problem} /> : null}

      <div>
        <Button
          disabled={token.trim() === ""}
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
