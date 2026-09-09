import { Logo } from "@renderer/components/logo";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";

/**
 * The moment before the app knows whether it may work.
 *
 * The keychain answers in a few milliseconds, so this screen is a held breath
 * rather than a report: the mark, one line, and the dot that says something is
 * still happening. Anything more would flash past unread.
 */
export function AccountReadingScreen() {
  const t = useTranslations();

  return (
    <div className="draggable grid h-full place-items-center bg-base px-8">
      <div className="fade-in flex flex-col items-center gap-5">
        <Logo size={34} />

        <WaitingLine>{t("account.reading.title")}</WaitingLine>
      </div>
    </div>
  );
}
