import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import { useState } from "react";
import { Button, type ButtonIcon, type ButtonVariant } from "./button";

/**
 * A gesture that cannot be undone, asked twice in the same place.
 *
 * The question replaces the button rather than floating over the page: the
 * reader keeps what they were looking at, and the second click is exactly where
 * the first one was — which is also why the confirmation says what it will do,
 * not "are you sure".
 *
 * The question also stays up while the work runs, so the spinner turns on the
 * button that was clicked instead of on a row that has already vanished.
 */
export function ConfirmButton({
  children,
  question,
  confirmLabel,
  onConfirm,
  icon,
  variant = "danger",
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
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations();

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

  if (!asking) {
    return (
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
    );
  }

  return (
    <span
      className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-sm border border-line-strong bg-sunken px-2 py-1 ${className}`}
    >
      <span className="min-w-0 flex-1 basis-40 text-[12px] text-ink-2 leading-snug">
        {question}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        <Button onClick={confirm} size="sm" variant="destructive">
          {confirmLabel}
        </Button>
        <Button
          disabled={working}
          onClick={() => setAsking(false)}
          size="sm"
          variant="discreet"
        >
          {t("common.cancel")}
        </Button>
      </span>
    </span>
  );
}
