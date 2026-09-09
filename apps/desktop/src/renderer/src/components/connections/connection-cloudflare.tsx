import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Field, proseControlClass } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useConnections } from "@renderer/stores/connections";
import { Unplug } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The client's Cloudflare account, given once and weighed at once.
 *
 * The token goes to the system keychain and never comes back down into the
 * window, so this can say an account is connected and under what name, never
 * with what. Nothing here asks for an identifier: what the token opens is read
 * from Cloudflare, which is also how a bad token is caught at the fifth second
 * rather than at the eighth step.
 */
export function ConnectionCloudflare({
  compact = false,
}: {
  compact?: boolean;
}) {
  const t = useTranslations();

  const state = useConnections((store) => store.state.cloudflare);
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
        data-connection="cloudflare"
      >
        <div className="min-w-0">
          <p className="text-[13px] text-ink">
            {t("connections.cloudflare.connected", {
              account: state.connection.accountName,
            })}
          </p>

          {state.sealed ? null : (
            <p className="mt-1 text-[12px] text-warn">
              {t("connections.cloudflare.unsealed")}
            </p>
          )}
        </div>

        {/*
          Disconnecting takes the account away from every server that publishes
          through it, so it is drawn as what it is: an outline that reads as a
          button on the panel it sits on, and the tone of what it undoes as the
          hand comes near.
        */}
        <Button
          icon={Unplug}
          loading={busy}
          onClick={() => forget("cloudflare")}
          size="sm"
          variant="danger"
        >
          {t("connections.cloudflare.forget")}
        </Button>
      </div>
    );
  }

  async function submit(): Promise<void> {
    if (await connect("cloudflare", token)) {
      setToken("");
    }
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-connected="false"
      data-connection="cloudflare"
    >
      {compact ? null : (
        <p className="text-ink-3 leading-relaxed">
          {t("connections.cloudflare.intro")}
        </p>
      )}

      <Field
        help={t("connections.cloudflare.tokenHelp")}
        hint={{
          text: t("connections.cloudflare.tokenHint"),
          url: "https://dash.cloudflare.com/profile/api-tokens",
        }}
        label={t("connections.cloudflare.tokenLabel")}
        name="connections.cloudflare.token"
        required
      >
        <input
          className={proseControlClass}
          id="connections.cloudflare.token"
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
          {t("connections.cloudflare.save")}
        </Button>
      </div>
    </div>
  );
}
