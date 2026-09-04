import { useCatalog } from "../../stores/catalog";
import { ConfigScreen } from "../config/config-screen";
import { OnboardingReplayNotice } from "./onboarding-replay-notice";

/**
 * The configuration screen of APP-05, mounted for the two moments that need it:
 * before the first install, and again for a module whose secret the app no
 * longer has.
 */
export function OnboardingConfigStep({
  serverName,
  machineName,
  replaying,
  onMachineName,
  onBack,
  onInstall,
  onReplay,
}: {
  serverName: string;
  machineName: string;
  replaying: string | null;
  onMachineName: (name: string) => void;
  onBack: () => void;
  onInstall: () => void;
  onReplay: (moduleId: string) => void;
}) {
  const modules = useCatalog((state) => state.modules);

  function nameOf(moduleId: string): string {
    return (
      modules().find((manifest) => manifest.id === moduleId)?.name ?? moduleId
    );
  }

  if (replaying) {
    return (
      <ConfigScreen
        machineName={machineName}
        notice={<OnboardingReplayNotice moduleName={nameOf(replaying)} />}
        onInstall={() => onReplay(replaying)}
        only={[replaying]}
        onMachineName={onMachineName}
        serverName={serverName}
        submitLabel="Rejouer ce module"
      />
    );
  }

  return (
    <ConfigScreen
      machineName={machineName}
      onBack={onBack}
      onInstall={onInstall}
      onMachineName={onMachineName}
      serverName={serverName}
    />
  );
}
