import { useTranslations } from "@renderer/i18n/use-translations";
import { WaitingNotice } from "../ui/waiting-notice";

export function InstallSending() {
  const t = useTranslations();

  return (
    <WaitingNotice
      detail={t("install.sending.detail")}
      title={t("install.sending.title")}
    />
  );
}
