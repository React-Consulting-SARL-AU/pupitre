import type { Manifest } from "@pupitre/shared/catalog";
import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { defaultsOf } from "@renderer/lib/catalog-selection";
import { removalOf } from "@renderer/lib/service-removal";
import { useServices } from "@renderer/stores/services";
import { useTunnel } from "@renderer/stores/tunnel";
import { databaseEngineOf } from "@shared/services";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { ServiceConfig } from "./service-config";
import { ServiceCredentials } from "./service-credentials";
import { ServiceDatabase } from "./service-database";
import { ServiceForward } from "./service-forward";
import { ServicePanelHeader } from "./service-panel-header";
import { ServiceRemoval } from "./service-removal";
import { ServiceRemovalOutcome } from "./service-removal-outcome";

/**
 * One service, day to day.
 *
 * Everything on this page is the agent's answer for this module: its state, its
 * port, the labels of its credentials, and what a removal would cost according
 * to its own manifest. The app adds the masks, the confirmation, and the `ssh`
 * that brings its port here.
 */
export function ServicePanel({
  serverId,
  moduleId,
  manifest,
  installed,
  catalogHeld = false,
  onBack,
  onReloadCatalog,
  onTerminal,
}: {
  serverId: string;
  moduleId: string;
  /** The manifest this server declares for the module, when it declares one. */
  manifest: Manifest | null;
  installed: readonly Manifest[];
  /** The catalogue is refused for the whole server, not lost for this module. */
  catalogHeld?: boolean;
  onBack: () => void;
  onReloadCatalog?: () => void;
  onTerminal?: () => void;
}) {
  const t = useTranslations();

  const store = useServices();
  const tunnel = useTunnel();

  const { open, readConfig } = store;
  const { readForwards } = tunnel;

  // Leaving the page is enough to drop the values, whichever way it is left.
  useEffect(() => {
    open(serverId, moduleId);
    readConfig(serverId, moduleId, manifest ? defaultsOf(manifest) : {});
    readForwards(serverId);

    return () => {
      window.pupitre.forgetCredentials(serverId, moduleId);
    };
  }, [serverId, moduleId, manifest, open, readConfig, readForwards]);

  const {
    detail,
    config,
    apply,
    values,
    secrets,
    removal,
    steps,
    database,
    busy,
    problem,
  } = store;

  function nameOf(id: string): string {
    return installed.find((module) => module.id === id)?.name ?? id;
  }

  if (detail.status === "failed") {
    return (
      <section className="flex flex-col gap-gutter">
        <ErrorNotice
          error={detail.error}
          onRetry={() => open(serverId, moduleId)}
        />
        <div>
          <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
            {t("services.panel.back")}
          </Button>
        </div>
      </section>
    );
  }

  if (detail.status !== "ready" || detail.moduleId !== moduleId) {
    return (
      <WaitingNotice
        detail={t("services.panel.waitingDetail")}
        title={t("services.panel.waitingTitle")}
      />
    );
  }

  const isDatabase = databaseEngineOf(moduleId) !== null;

  return (
    <section className="flex flex-col gap-section">
      <ServicePanelHeader
        detail={detail.detail}
        onBack={onBack}
        onReload={() => open(serverId, moduleId)}
        summary={manifest?.summary}
      />

      {problem ? <ErrorNotice error={problem} /> : null}

      <ServiceCredentials
        database={isDatabase}
        labels={detail.detail.credentials}
        loading={busy === "db.url"}
        onConnectionUrl={() => store.connectionUrl(serverId, moduleId)}
        onCopy={(label) => store.copy(serverId, moduleId, label)}
        onReveal={(label) => store.reveal(serverId, moduleId, label)}
      />

      <ServiceConfig
        apply={apply}
        catalogHeld={catalogHeld}
        config={config}
        configured={detail.detail.configured}
        manifest={manifest}
        name={detail.detail.name}
        onApply={() => store.reconfigure(serverId, moduleId)}
        onGenerate={(key) => store.generate(serverId, moduleId, key)}
        onReloadCatalog={onReloadCatalog}
        onReveal={(key) => store.revealSecret(serverId, moduleId, key)}
        onSecret={(key, value) => {
          store.setSecret(serverId, moduleId, key, value);
        }}
        onValue={store.setValue}
        secrets={secrets}
        steps={steps}
        values={values}
      />

      {isDatabase ? (
        <ServiceDatabase
          busy={busy}
          onDump={() => store.dump(serverId, moduleId)}
          onImport={() => store.importDumps(serverId, moduleId)}
          onShell={() => store.shell(serverId, moduleId)}
          onTerminal={onTerminal}
          outcome={database}
        />
      ) : null}

      <ServiceForward
        forwards={tunnel.forwards}
        onClose={(id) => tunnel.closeForward(id)}
        onOpen={() =>
          detail.detail.port === undefined
            ? undefined
            : tunnel.forward(serverId, detail.detail.port, moduleId)
        }
        port={detail.detail.port}
      />

      {removal.status === "idle" ? (
        <ServiceRemoval
          name={detail.detail.name}
          onRemove={() => store.remove(serverId, moduleId)}
          removal={removalOf(
            { id: moduleId, manifest, name: detail.detail.name },
            installed
          )}
        />
      ) : (
        <ServiceRemovalOutcome
          nameOf={nameOf}
          onBack={onBack}
          removal={removal}
          steps={steps}
        />
      )}
    </section>
  );
}
