import type { Login } from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import { ConnectionCard } from "@renderer/components/connections/connection-card";
import { descriptorOf } from "@renderer/components/connections/connection-descriptors";
import { Callout } from "@renderer/components/ui/callout";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { accountStateOf } from "@renderer/lib/account-state";
import { LOGIN_LOOK } from "@renderer/lib/project-state";
import { useConnections } from "@renderer/stores/connections";

export function ServiceAccount({
  login,
  manifest,
  installed,
  serverName,
}: {
  login?: Login;
  manifest: Manifest | null;
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
          className="min-w-0 break-all font-data text-control text-ink"
          data-login-account=""
        >
          {account}
        </span>
      ) : null}
    </div>
  );

  return (
    <Section data-service-account={state} title={t("services.account.title")}>
      {connection ? (
        <Panel inset="lg">
          <ConnectionCard
            compact
            connection={connection}
            installed={installed.map((module) => module.id)}
            manifests={installed}
            serverName={serverName}
            status={status}
          />
        </Panel>
      ) : (
        status
      )}

      {login?.fix ? (
        <Callout name="login-fix" tone="warn">
          {login.fix}
        </Callout>
      ) : null}
    </Section>
  );
}
