import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import { useState } from "react";
import { Button, type ButtonIcon, type ButtonVariant } from "./button";
import { DIALOG_BACKDROP, DIALOG_POPUP, DIALOG_TITLE } from "./dialog";

export function ConfirmButton({
  children,
  question,
  confirmLabel,
  onConfirm,
  icon,
  variant = "danger",
  confirmVariant = "destructive",
  size = "md",
  disabled = false,
  ariaLabel,
  className = "",
}: {
  children: string;
  question: string;
  confirmLabel: string;
  onConfirm: Gesture;
  icon?: ButtonIcon;
  variant?: ButtonVariant;
  confirmVariant?: "destructive" | "inverse";
  size?: "sm" | "md";
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);

  async function confirm() {
    setWorking(true);

    try {
      // Closed only after the work, so the spinner stays on the answer rather than on a row that vanished.
      await onConfirm();
      setAsking(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <Button
        ariaLabel={ariaLabel}
        className={className}
        disabled={disabled}
        icon={icon}
        onClick={() => setAsking(true)}
        size={size}
        variant={variant}
      >
        {children}
      </Button>

      <ConfirmDialog
        confirmLabel={confirmLabel}
        confirmVariant={confirmVariant}
        onCancel={() => setAsking(false)}
        onConfirm={confirm}
        open={asking}
        question={question}
        title={children}
        working={working}
      />
    </>
  );
}

export function ConfirmDialog({
  open,
  title,
  question,
  confirmLabel,
  confirmVariant = "destructive",
  working = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  question: string;
  confirmLabel: string;
  confirmVariant?: "destructive" | "inverse";
  working?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  return (
    <AlertDialog.Root
      onOpenChange={(next) => {
        if (!(next || working)) {
          onCancel();
        }
      }}
      open={open}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={DIALOG_BACKDROP} />
        <AlertDialog.Popup
          className={`${DIALOG_POPUP} w-[min(28rem,calc(100vw-2rem))]`}
          data-dialog="confirm"
        >
          <AlertDialog.Title className={DIALOG_TITLE}>
            {title}
          </AlertDialog.Title>

          <AlertDialog.Description className="text-control text-ink-2 leading-relaxed">
            {question}
          </AlertDialog.Description>

          <div className="flex items-center justify-end gap-2">
            <Button disabled={working} onClick={onCancel} variant="discreet">
              {t("common.cancel")}
            </Button>
            <Button
              disabled={working}
              loading={working}
              onClick={onConfirm}
              variant={confirmVariant}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
