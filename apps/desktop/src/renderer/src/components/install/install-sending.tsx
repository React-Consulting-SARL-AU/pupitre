import { useTranslations } from "@renderer/i18n/use-translations";
import { WaitingNotice } from "../ui/waiting-notice";

/**
 * The one wait the agent cannot narrate, because it is not on the machine yet.
 */
export function InstallSending() {
  const t = useTranslations();

  return (
    <WaitingNotice
      detail={t("install.sending.detail")}
      title={t("install.sending.title")}
    />
  );
}
