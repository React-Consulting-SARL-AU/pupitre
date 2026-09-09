import { type Gesture, usePending } from "@renderer/lib/use-pending";
import type { ComponentType, ReactNode } from "react";
import { Spinner } from "./spinner";

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
  // The one filled colour of the system, and it is spent here: the gesture that
  // destroys must be the loudest thing on the panel that asks for it, never the
  // quietest. `base` is white on the light theme and near-black on the dark one,
  // so the ink stays readable on both reds.
  destructive:
    "border border-danger bg-danger text-base hover:border-danger/80 hover:bg-danger/80",
};

const SIZE = {
  sm: "gap-1.5 px-3 py-1 text-[12px]",
  md: "gap-2 px-3.5 py-1.5 text-[13px]",
};

const SHARED =
  "clickable inline-flex shrink-0 items-center whitespace-nowrap rounded-full transition-soft";

/**
 * A button that waits is not a button that is off: it keeps its full ink and
 * turns its spinner, and only a control that really cannot be pressed fades.
 */
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
  title,
  className = "",
}: {
  children: ReactNode;
  /** Answer with the promise of the work started and the button waits on it. */
  onClick?: Gesture;
  variant?: ButtonVariant;
  size?: keyof typeof SIZE;
  icon?: ButtonIcon;
  /** While it works the button spins in place of its icon, and takes no click. */
  loading?: boolean;
  disabled?: boolean;
  submit?: boolean;
  title?: string;
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

  return (
    <button
      aria-busy={waiting}
      className={`${SHARED} ${VARIANT[variant]} ${SIZE[size]} ${stateClass(waiting, disabled)} ${className}`}
      disabled={disabled || waiting}
      onClick={click}
      title={title}
      type={submit ? "submit" : "button"}
    >
      {glyph}
      {children}
    </button>
  );
}
