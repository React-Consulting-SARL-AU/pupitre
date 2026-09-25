import { Button } from "@renderer/components/ui/button";
import { Dialog } from "@renderer/components/ui/dialog";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Trash2 } from "lucide-react";

export function ServiceRemovalLosses({
  open,
  name,
  losses,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  name: string;
  losses: readonly string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog
      actions={
        <>
          <Button onClick={onCancel} size="sm" variant="discreet">
            {t("common.cancel")}
          </Button>
          <Button
            icon={Trash2}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {t("services.removal.losses.confirm")}
          </Button>
        </>
      }
      name="uninstall"
      onClose={onCancel}
      open={open}
      title={t("services.removal.losses.intro", { name })}
    >
      <div className="flex flex-col gap-3" data-confirm="uninstall">
        <ul className="flex flex-col gap-1.5">
          {losses.map((loss) => (
            <li className="flex items-start gap-2 text-ink-2" key={loss}>
              <span className="pt-1">
                <StatusDot shape="struck" size={9} tone="danger" />
              </span>
              <span className="text-control leading-relaxed">{loss}</span>
            </li>
          ))}
        </ul>

        <p className="text-ink-3 text-small leading-relaxed">
          {t("services.removal.losses.note")}
        </p>
      </div>
    </Dialog>
  );
}
