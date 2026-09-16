import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import { useState } from "react";
import { Button, type ButtonIcon, type ButtonVariant } from "./button";
import { Dialog } from "./dialog";

/**
 * A gesture that cannot be undone, asked twice.
 *
 * The button stays what it is, where it is; the question floats over the
 * window in a dialog, the same frame as every other question the app asks,
 * so nothing around the button moves or breaks to make room for it. The
 * confirmation says what it will do, not "are you sure".
 *
 * The dialog stays up while the work runs, so the spinner turns on the answer
 * that was clicked instead of on a row that has already vanished.
 */
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
  className = "",
}: {
  children: string;
  /** What is about to happen, in one line. */
  question: string;
  confirmLabel: string;
  onConfirm: Gesture;
  icon?: ButtonIcon;
  variant?: ButtonVariant;
  /** The answer's look: red for what cannot be undone, `inverse` for a gesture that can. */
  confirmVariant?: "destructive" | "inverse";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);

  async function confirm() {
    setWorking(true);

    try {
      await onConfirm();
      setAsking(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <Button
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

/** The question of a ConfirmButton, drawn on its own: what a test reads, and what the button opens. */
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
    <Dialog
      actions={
        <>
          <Button disabled={working} onClick={onCancel} variant="discreet">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={working}
            onClick={onConfirm}
            variant={confirmVariant}
          >
            {confirmLabel}
          </Button>
        </>
      }
      name="confirm"
      onClose={working ? () => undefined : onCancel}
      open={open}
      title={title}
    >
      <p className="text-[13px] text-ink-2 leading-relaxed">{question}</p>
    </Dialog>
  );
}
