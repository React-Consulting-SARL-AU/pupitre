import { useTranslations } from "@renderer/i18n/use-translations";
import { useNavigation } from "@renderer/stores/navigation";
import { ConfirmDialog } from "../ui/confirm-button";

export function TerminalCloseDialog() {
  const t = useTranslations();

  const closing = useNavigation((s) =>
    s.terminals.find((terminal) => terminal.id === s.closing)
  );
  const working = useNavigation((s) =>
    s.closing ? s.terminalStates[s.closing] === "working" : false
  );
  const keep = useNavigation((s) => s.keepTerminal);
  const close = useNavigation((s) => s.closeTerminal);

  const title = closing?.title ?? "";

  return (
    <ConfirmDialog
      confirmLabel={t("terminals.closeAsk.confirm")}
      onCancel={keep}
      onConfirm={() => closing && close(closing.id)}
      open={closing !== undefined}
      question={
        working
          ? t("terminals.closeAsk.working", { title })
          : t("terminals.closeAsk.agent", { title })
      }
      title={t("terminals.closeAsk.title", { title })}
    />
  );
}
