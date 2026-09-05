import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";

/**
 * The moment before the app knows whether it may work.
 *
 * The keychain answers in a few milliseconds, but until it has there is no
 * usage right to judge: showing the onboarding here would open a build that
 * refuses to install anything.
 */
export function AccountReadingScreen() {
  const t = useTranslations();

  return (
    <div className="grid h-full place-items-center px-8">
      <div className="w-full max-w-xl">
        <WaitingNotice
          detail={t("account.reading.detail")}
          title={t("account.reading.title")}
        />
      </div>
    </div>
  );
}
