import { useTranslations } from "@renderer/i18n/use-translations";
import { LogOut } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/**
 * The question the menu's "Sign out" asks before anything happens.
 *
 * The menu is painted by the system and cannot ask; the window can, and it
 * asks here, in the same words the account screen uses. Escape, the backdrop
 * and the cancel button all leave the account as it is.
 */
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
      <p className="text-[13px] text-ink-2 leading-relaxed">
        {t("account.identity.disconnectQuestion")}
      </p>
    </Dialog>
  );
}
