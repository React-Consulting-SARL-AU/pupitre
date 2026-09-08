import { Button } from "@renderer/components/ui/button";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Trash2 } from "lucide-react";

/**
 * The bill of a removal, read before it is paid.
 *
 * Each line is something this machine will not have any more, drawn from the
 * manifest of the module itself. The question is never "are you sure": it is
 * the list.
 */
export function ServiceRemovalLosses({
  name,
  losses,
  onConfirm,
  onCancel,
}: {
  name: string;
  losses: readonly string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  return (
    <section
      className="elevation-raised flex flex-col gap-3 rounded-md border border-danger/40 bg-surface px-4 py-4"
      data-confirm="uninstall"
    >
      <p className="text-ink">{t("services.removal.losses.intro", { name })}</p>

      <ul className="flex flex-col gap-1.5">
        {losses.map((loss) => (
          <li className="flex items-start gap-2 text-ink-2" key={loss}>
            <span className="pt-1">
              <StatusDot shape="struck" size={9} tone="danger" />
            </span>
            <span className="leading-relaxed">{loss}</span>
          </li>
        ))}
      </ul>

      <p className="text-[12px] text-ink-3 leading-relaxed">
        {t("services.removal.losses.note")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Trash2} onClick={onConfirm} variant="danger">
          {t("services.removal.losses.confirm")}
        </Button>
        <Button onClick={onCancel} variant="discreet">
          {t("common.cancel")}
        </Button>
      </div>
    </section>
  );
}
