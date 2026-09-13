import type { Manifest } from "@pupitre/shared/catalog";
import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Screen } from "@renderer/components/ui/screen";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { SERVICE_LOOK } from "@renderer/lib/project-state";
import { removalOf } from "@renderer/lib/service-removal";
import { useCatalog } from "@renderer/stores/catalog";
import { useConnections } from "@renderer/stores/connections";
import { useServices } from "@renderer/stores/services";
import { forwardsOf, useTunnel } from "@renderer/stores/tunnel";
import { databaseEngineOf } from "@shared/services";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { ServiceAccount } from "./service-account";
import { ServiceConfig } from "./service-config";
import { ServiceControls } from "./service-controls";
import { ServiceCredentials } from "./service-credentials";
import { ServiceDatabase } from "./service-database";
import { ServiceForward } from "./service-forward";
import { ServiceJournal } from "./service-journal";
import { ServicePanelFacts } from "./service-panel-facts";
import { ServiceRemoval } from "./service-removal";
import { ServiceRemovalOutcome } from "./service-removal-outcome";
import { ServiceRoutes } from "./service-routes";

/**
 * One service, day to day.
 *
 * Everything on this page is the agent's answer for this module: its state, its
 * port, the labels of its credentials, and what a removal would cost according
 * to its own manifest. The app adds the masks, the confirmation, and the `ssh`
 * that brings its port here.
 *
 * Every service reads in the same order, and a section a module has nothing
 * for is not drawn: the account it works as, the unit's gestures, what opens
 * it, what it was told, what only a database or a tunnel adds, its journal,
 * and the port brought to this computer.
 */
export function ServicePanel({
  serverId,
  serverName,
  moduleId,
  manifest,
  installed,
  catalogHeld = false,
  onBack,
  onReloadCatalog,
}: {
  serverId: string;
  serverName: string | null;
  moduleId: string;
  /** The manifest this server declares for the module, when it declares one. */
  manifest: Manifest | null;
  installed: readonly Manifest[];
  /** The catalogue is refused for the whole server, not lost for this module. */
  catalogHeld?: boolean;
  onBack: () => void;
  onReloadCatalog?: () => void;
}) {
  const t = useTranslations();

  const store = useServices();
  const tunnel = useTunnel();
  const catalog = useCatalog((held) => held.modules);
  const zonesConnected = useConnections(
    (connections) => connections.state.cloudflare?.status === "connected"
  );
  const zones = useConnections((connections) => connections.zones);
  const loadZones = useConnections((connections) => connections.loadZones);

  const { open } = store;
  const picksZone = manifest?.connection === "cloudflare" && zonesConnected;

  // The domain of a tunnel is picked among the account's zones: they are read
  // once the panel knows the module publishes through that account.
  useEffect(() => {
    if (picksZone) {
      loadZones();
    }
  }, [picksZone, loadZones]);

  // Leaving the page is enough to drop the values, whichever way it is left.
  useEffect(() => {
    open(serverId, moduleId, manifest);

    return () => {
      window.pupitre.forgetCredentials(serverId, moduleId);
    };
  }, [serverId, moduleId, manifest, open]);

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

  const reload = () => open(serverId, moduleId, manifest);
  const ready = detail.status === "ready" && detail.moduleId === moduleId;
  const name = ready ? detail.detail.name : (manifest?.name ?? moduleId);

  // The frame stands before the agent answers: the name, the way back and the
  // reread do not move while the module is being read, or when it was not.
  const frame = {
    actions: (
      <>
        <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
          {t("services.panel.back")}
        </Button>
        <Button icon={RefreshCw} onClick={reload} variant="discreet">
          {t("services.panel.reload")}
        </Button>
      </>
    ),
    eyebrow: t("services.screen.eyebrow"),
    leading: <ServiceLogo moduleId={moduleId} name={name} size={32} />,
    title: name,
  };

  if (detail.status === "failed") {
    return (
      <Screen {...frame}>
        <ErrorNotice error={detail.error} onRetry={reload} />
      </Screen>
    );
  }

  if (!ready) {
    return (
      <Screen {...frame}>
        <WaitingNotice title={t("services.panel.waitingTitle")} />
      </Screen>
    );
  }

  const isDatabase = databaseEngineOf(moduleId) !== null;
  const exposure =
    tunnel.tunnel.status === "ready" &&
    tunnel.tunnel.tunnel.installed &&
    moduleId === `exposure.${tunnel.tunnel.tunnel.provider}`
      ? tunnel.tunnel.tunnel
      : null;
  const retirement = removalOf(
    { id: moduleId, manifest, name: detail.detail.name },
    installed
  );

  return (
    <Screen
      {...frame}
      actions={
        <>
          {frame.actions}
          {removal.status === "idle" ? (
            <ServiceRemoval
              name={detail.detail.name}
              onRemove={() => store.remove(serverId, moduleId)}
              removal={retirement}
            />
          ) : null}
        </>
      }
      description={
        <ServicePanelFacts
          detail={detail.detail}
          refusal={retirement.refusal}
          summary={manifest?.summary}
        />
      }
      meta={
        <StatePill
          look={SERVICE_LOOK[detail.detail.state]}
          name={detail.detail.state}
        />
      }
    >
      <ServiceRemovalOutcome
        nameOf={nameOf}
        onBack={onBack}
        removal={removal}
        steps={steps}
      />

      {problem ? <ErrorNotice error={problem} /> : null}

      <ServiceAccount
        installed={installed}
        login={detail.detail.login}
        manifest={manifest}
        serverName={serverName}
      />

      {detail.detail.unit ? (
        <ServiceControls
          busy={busy}
          detail={detail.detail}
          onControl={(cmd) => store.control(serverId, moduleId, cmd)}
        />
      ) : null}

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
        nameOf={(id) =>
          id === moduleId
            ? detail.detail.name
            : (catalog().find((one) => one.id === id)?.name ?? id)
        }
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
        zones={picksZone ? zones : []}
      />

      {isDatabase ? (
        <ServiceDatabase
          busy={busy}
          dumps={store.dumps}
          onDownloadDump={() => store.downloadDump(serverId)}
          onDump={() => store.dump(serverId, moduleId)}
          onImport={() => store.importDumps(serverId, moduleId)}
          onImportFromComputer={() =>
            store.importFromComputer(serverId, moduleId)
          }
          onReadDumps={() => store.readDumps(serverId)}
          onRemoveDump={(fileName) => store.removeDump(serverId, fileName)}
          onRestoreDump={(fileName) =>
            store.restoreDump(serverId, moduleId, fileName)
          }
          onShell={() => store.shell(serverId, moduleId)}
          outcome={database}
          pendingImports={store.pendingImports}
        />
      ) : null}

      {exposure ? (
        <ServiceRoutes
          busy={tunnel.busy}
          onSync={() => tunnel.sync(serverId)}
          problem={tunnel.problem}
          tunnel={exposure}
        />
      ) : null}

      {detail.detail.unit ? (
        <ServiceJournal
          moduleId={moduleId}
          name={detail.detail.name}
          serverId={serverId}
        />
      ) : null}

      <ServiceForward
        forwards={forwardsOf(tunnel.forwards, serverId)}
        onClose={(id) => tunnel.closeForward(id)}
        onOpen={() =>
          detail.detail.port === undefined
            ? undefined
            : tunnel.forward(serverId, detail.detail.port, moduleId)
        }
        port={detail.detail.port}
      />
    </Screen>
  );
}
