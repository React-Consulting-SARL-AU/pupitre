import { type Gesture, usePending } from "@renderer/lib/use-pending";
import type { ComponentType, ReactNode } from "react";
import { Spinner } from "./spinner";
import { Tooltip } from "./tooltip";

export type ButtonVariant =
  | "default"
  | "inverse"
  | "discreet"
  | "danger"
  | "destructive";

export type ButtonIcon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

const VARIANT: Record<ButtonVariant, string> = {
  default: "border border-line-strong text-ink hover:bg-raised",
  inverse:
    "border border-inverse bg-inverse text-inverse-ink hover:border-ink-2 hover:bg-ink-2",
  discreet:
    "border border-transparent text-ink-2 hover:bg-raised hover:text-ink",
  danger:
    "border border-line-strong text-ink-2 hover:border-danger hover:text-danger",
  // The system's only filled colour; `text-base` stays readable on the red in both themes.
  destructive:
    "border border-danger bg-danger text-base hover:border-danger/80 hover:bg-danger/80",
};

const SIZE = {
  sm: "gap-1.5 px-3 py-1 text-small",
  md: "gap-2 px-3.5 py-1.5 text-control",
};

const SHARED =
  "clickable inline-flex shrink-0 items-center whitespace-nowrap rounded-full transition-soft";

export function buttonClass(
  variant: ButtonVariant = "default",
  size: keyof typeof SIZE = "md"
): string {
  return `${SHARED} ${VARIANT[variant]} ${SIZE[size]}`;
}

function stateClass(waiting: boolean, disabled: boolean): string {
  if (waiting) {
    return "cursor-progress";
  }

  return disabled ? "opacity-40" : "";
}

export function Button({
  children,
  onClick,
  variant = "default",
  size = "md",
  icon: Icon,
  loading = false,
  disabled = false,
  submit = false,
  hint,
  ariaLabel,
  className = "",
}: {
  children: ReactNode;
  /** Return the work's promise and the button waits on it. */
  onClick?: Gesture;
  variant?: ButtonVariant;
  size?: keyof typeof SIZE;
  icon?: ButtonIcon;
  loading?: boolean;
  disabled?: boolean;
  submit?: boolean;
  hint?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [click, pending] = usePending(onClick);

  const waiting = loading || pending;

  let glyph: ReactNode = null;

  if (waiting) {
    glyph = <Spinner size={14} />;
  } else if (Icon) {
    glyph = <Icon size={13} strokeWidth={1.5} />;
  }

  const button = (
    <button
      aria-busy={waiting}
      aria-label={ariaLabel}
      className={`${buttonClass(variant, size)} ${stateClass(waiting, disabled)} ${className}`}
      disabled={disabled || waiting}
      onClick={click}
      type={submit ? "submit" : "button"}
    >
      {glyph}
      {children}
    </button>
  );

  return hint ? <Tooltip label={hint}>{button}</Tooltip> : button;
}
