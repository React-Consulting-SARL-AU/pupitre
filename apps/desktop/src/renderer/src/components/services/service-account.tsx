import type { Login } from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import { ConnectionCard } from "@renderer/components/connections/connection-card";
import { descriptorOf } from "@renderer/components/connections/connection-descriptors";
import { Label } from "@renderer/components/ui/label";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { accountStateOf } from "@renderer/lib/account-state";
import { LOGIN_LOOK } from "@renderer/lib/project-state";
import { useConnections } from "@renderer/stores/connections";

/**
 * Whose account the module works as, and the gestures on that account.
 *
 * Two answers meet here. The agent's, when the module's CLI has one: asked on
 * this read alone, shown as it came — the state, the account it named, the
 * way to sign in when it named none. And the app's: the token this computer
 * holds for the module's connection, with its check and its way out. When the
 * agent answered, its state is the one shown; the app's only says what the
 * computer holds. A module with neither never reaches this section.
 */
export function ServiceAccount({
  login,
  manifest,
  installed,
  serverName,
}: {
  login?: Login;
  manifest: Manifest | null;
  /** The manifests of the modules this server runs, from the same catalogue as `manifest`. */
  installed: readonly Manifest[];
  serverName: string | null;
}) {
  const t = useTranslations();

  const connection = descriptorOf(manifest?.connection ?? "");
  const held = useConnections((store) =>
    connection ? store.state[connection.kind] : null
  );

  const state = accountStateOf(login, held);

  if (!state) {
    return null;
  }

  const connected = held?.status === "connected";
  const account =
    login?.account ??
    (connected ? (held.account?.name ?? t("connections.held")) : undefined);

  const status = (
    <div className="flex flex-wrap items-center gap-3">
      <StatePill look={LOGIN_LOOK[state]} name={state} />

      {account ? (
        <span
          className="min-w-0 break-all font-data text-[13px] text-ink"
          data-login-account=""
        >
          {account}
        </span>
      ) : null}
    </div>
  );

  return (
    <section className="flex flex-col gap-3" data-service-account={state}>
      <Label>{t("services.account.title")}</Label>

      {connection ? (
        <ConnectionCard
          compact
          connection={connection}
          installed={installed.map((module) => module.id)}
          manifests={installed}
          serverName={serverName}
          status={status}
        />
      ) : (
        status
      )}

      {login?.fix ? (
        <p className="text-[12px] text-ink-2 leading-relaxed" data-login-fix="">
          {login.fix}
        </p>
      ) : null}
    </section>
  );
}
