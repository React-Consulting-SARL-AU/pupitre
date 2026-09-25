import { useTranslations } from "@renderer/i18n/use-translations";
import { useCatalog } from "../../stores/catalog";
import { ConfigScreen } from "../config/config-screen";
import { OnboardingReplayNotice } from "./onboarding-replay-notice";
import { OnboardingResumeNotice } from "./onboarding-resume-notice";

export function OnboardingConfigStep({
  serverName,
  replaying,
  remaining,
  onInstall,
  onReplay,
}: {
  serverName: string;
  replaying: string | null;
  remaining: readonly string[];
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

  return <ConfigScreen onInstall={onInstall} plain serverName={serverName} />;
}
