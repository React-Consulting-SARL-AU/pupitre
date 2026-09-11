import { useTranslations } from "@renderer/i18n/use-translations";
import { useCatalog } from "../../stores/catalog";
import { ConfigScreen } from "../config/config-screen";
import { OnboardingReplayNotice } from "./onboarding-replay-notice";
import { OnboardingResumeNotice } from "./onboarding-resume-notice";

/**
 * The configuration screen, mounted for the three moments that need
 * it: before the first install, again for a module whose secret the app no
 * longer has, and once more for what an interrupted install never sent.
 */
export function OnboardingConfigStep({
  serverName,
  replaying,
  remaining,
  onBack,
  onInstall,
  onReplay,
}: {
  serverName: string;
  replaying: string | null;
  /** What a resumed onboarding has left to install, and must ask about again. */
  remaining: readonly string[];
  onBack: () => void;
  onInstall: () => void;
  onReplay: (moduleId: string) => void;
}) {
  const t = useTranslations();

  const modules = useCatalog((state) => state.modules);

  function nameOf(moduleId: string): string {
    return (
      modules().find((manifest) => manifest.id === moduleId)?.name ?? moduleId
    );
  }

  if (replaying) {
    return (
      <ConfigScreen
        notice={<OnboardingReplayNotice moduleName={nameOf(replaying)} />}
        onInstall={() => onReplay(replaying)}
        only={[replaying]}
        plain
        serverName={serverName}
        submitLabel={t("onboarding.config.replaySubmit")}
      />
    );
  }

  if (remaining.length > 0) {
    return (
      <ConfigScreen
        notice={<OnboardingResumeNotice names={remaining.map(nameOf)} />}
        onInstall={onInstall}
        only={remaining}
        plain
        serverName={serverName}
        submitLabel={t("onboarding.config.resumeSubmit")}
      />
    );
  }

  return (
    <ConfigScreen
      onBack={onBack}
      onInstall={onInstall}
      plain
      serverName={serverName}
    />
  );
}
