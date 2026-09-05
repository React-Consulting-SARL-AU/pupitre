import type { ComponentType, ReactNode } from "react";
import { StatusDot } from "./status-dot";

export type ButtonVariant = "default" | "inverse" | "discreet" | "danger";

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
};

const SIZE = {
  sm: "gap-1.5 px-3 py-1 text-[11px]",
  md: "gap-2 px-3.5 py-1.5 text-[12px]",
};

const SHARED =
  "clickable inline-flex shrink-0 items-center whitespace-nowrap rounded-full transition-soft disabled:opacity-40";

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
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: keyof typeof SIZE;
  icon?: ButtonIcon;
  /** While it works the button breathes: the one animation the system grants. */
  loading?: boolean;
  disabled?: boolean;
  submit?: boolean;
  title?: string;
  className?: string;
}) {
  let glyph: ReactNode = null;
  if (loading) {
    glyph = <StatusDot shape="breathing" size={13} />;
  } else if (Icon) {
    glyph = <Icon size={13} strokeWidth={1.5} />;
  }

  return (
    <button
      aria-busy={loading}
      className={`${SHARED} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      type={submit ? "submit" : "button"}
    >
      {glyph}
      {children}
    </button>
  );
}
