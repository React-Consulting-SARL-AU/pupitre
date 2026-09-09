import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Field, proseControlClass } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useConnections } from "@renderer/stores/connections";
import { Unplug } from "lucide-react";
import { useEffect, useState } from "react";
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
}: {
  connection: ConnectionDescriptor;
  compact?: boolean;
}) {
  const t = useTranslations();

  const state = useConnections((store) => store.state[connection.kind]);
  const busy = useConnections((store) => store.busy);
  const problem = useConnections((store) => store.problem);
  const read = useConnections((store) => store.read);
  const connect = useConnections((store) => store.connect);
  const forget = useConnections((store) => store.forget);

  const [token, setToken] = useState("");

  useEffect(() => {
    read();
  }, [read]);

  if (state.status === "connected") {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-connected="true"
        data-connection={connection.kind}
      >
        <div className="min-w-0">
          <p className="text-[13px] text-ink">
            {state.account
              ? t("connections.connected", { account: state.account.name })
              : t("connections.held")}
          </p>

          {state.sealed ? null : (
            <p className="mt-1 text-[12px] text-warn">
              {t("connections.unsealed")}
            </p>
          )}
        </div>

        {/*
          Disconnecting takes the account away from every server that uses it,
          so it is drawn as what it is: an outline that reads as a button on the
          panel it sits on, and the tone of what it undoes as the hand comes
          near.
        */}
        <Button
          icon={Unplug}
          loading={busy}
          onClick={() => forget(connection.kind)}
          size="sm"
          variant="danger"
        >
          {t("connections.forget")}
        </Button>
      </div>
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
