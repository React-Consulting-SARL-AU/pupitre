import { useTranslations } from "@renderer/i18n/use-translations";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, type ButtonVariant } from "./button";

const FEEDBACK_MS = 1600;

/**
 * A button that puts something on the clipboard and says so where it was
 * pressed: the glyph turns into a check and the label into "copied" for a
 * moment, then the button is itself again. What is copied is the caller's —
 * text, an image — and a clipboard that refuses leaves the button as it was.
 */
export function CopyButton({
  children,
  onCopy,
  size = "sm",
  variant = "default",
  disabled = false,
  hint,
}: {
  children: string;
  onCopy: () => Promise<unknown> | unknown;
  size?: "sm" | "md";
  variant?: ButtonVariant;
  disabled?: boolean;
  hint?: string;
}) {
  const t = useTranslations();

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  async function copy(): Promise<void> {
    try {
      await onCopy();
    } catch {
      return;
    }

    setCopied(true);

    if (timer.current) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return (
    <Button
      disabled={disabled}
      hint={hint}
      icon={copied ? Check : Copy}
      onClick={copy}
      size={size}
      variant={variant}
    >
      {copied ? t("common.copied") : children}
    </Button>
  );
}
