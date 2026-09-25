import { useTranslations } from "@renderer/i18n/use-translations";
import { LogOut } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/** The native menu cannot ask for confirmation, so its "Sign out" asks here. */
export function SignOutDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => Promise<void>;
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
            icon={LogOut}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {t("shell.signOut.confirm")}
          </Button>
        </>
      }
      name="sign-out"
      onClose={onCancel}
      open={open}
      title={t("shell.signOut.title")}
    >
      <p className="text-control text-ink-2 leading-relaxed">
        {t("account.identity.disconnectQuestion")}
      </p>
    </Dialog>
  );
}
