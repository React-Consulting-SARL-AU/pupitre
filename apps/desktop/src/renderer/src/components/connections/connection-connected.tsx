import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import type {
  ConnectionHealth,
  forgetScope,
} from "@renderer/stores/connections";
import type { ConnectionState } from "@shared/connections";
import type { ConnectionDescriptor } from "./connection-descriptors";
import { ConnectionHealthLine } from "./connection-health-line";

type Scope = ReturnType<typeof forgetScope>;

/** What forgetting takes away, in one line: the server and its modules when they are known. */
export function forgetQuestion(
  t: Translate,
  scope: Scope,
  serverName: string | null
): string {
  if (!(scope.known && serverName)) {
    return t("connections.forgetQuestion.unknown");
  }

  if (scope.modules.length === 0) {
    return t("connections.forgetQuestion.unused", { server: serverName });
  }

  return t("connections.forgetQuestion.used", {
    modules: scope.modules.join(", "),
    server: serverName,
  });
}

/**
 * A connected account: who it is, whether it still answers, and the way out.
 *
 * Disconnecting takes the account away from every server that uses it, so it
 * is asked twice and the question names what it takes: the active server and
 * the installed modules that declare this account, when the catalogue has
 * been read. Checking asks the provider again — a token revoked upstream reads
 * here rather than at the next failed install.
 */
export function ConnectionConnected({
  connection,
  state,
  health,
  scope,
  serverName,
  busy,
  onVerify,
  onForget,
}: {
  connection: ConnectionDescriptor;
  state: Extract<ConnectionState, { status: "connected" }>;
  health: ConnectionHealth | undefined;
  scope: Scope;
  serverName: string | null;
  busy: boolean;
  onVerify: () => Promise<void>;
  onForget: () => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <div
      className="flex flex-col gap-3"
      data-connected="true"
      data-connection={connection.kind}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {connection.named ? (
            <Button
              loading={health?.status === "checking"}
              onClick={onVerify}
              size="sm"
            >
              {t("connections.verify")}
            </Button>
          ) : null}

          <ConfirmButton
            confirmLabel={t("connections.forgetConfirm")}
            disabled={busy}
            onConfirm={onForget}
            question={forgetQuestion(t, scope, serverName)}
            size="sm"
          >
            {t("connections.forget")}
          </ConfirmButton>
        </div>
      </div>

      {health ? <ConnectionHealthLine health={health} /> : null}
    </div>
  );
}
