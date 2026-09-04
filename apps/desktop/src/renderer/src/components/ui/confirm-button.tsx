import { useState } from "react";
import { Button, type ButtonIcon, type ButtonVariant } from "./button";

/**
 * A gesture that cannot be undone, asked twice in the same place.
 *
 * The question replaces the button rather than floating over the page: the
 * reader keeps what they were looking at, and the second click is exactly where
 * the first one was — which is also why the confirmation says what it will do,
 * not "are you sure".
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
  onConfirm: () => void;
  icon?: ButtonIcon;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);

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
      className={`inline-flex items-center gap-2 rounded-sm border border-line-strong bg-sunken px-2 py-1 ${className}`}
    >
      <span className="text-[11px] text-ink-2">{question}</span>
      <Button
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        size="sm"
        variant="danger"
      >
        {confirmLabel}
      </Button>
      <Button onClick={() => setAsking(false)} size="sm" variant="discreet">
        Annuler
      </Button>
    </span>
  );
}
