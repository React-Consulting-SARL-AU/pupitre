import { useTranslations } from "@renderer/i18n/use-translations";
import type { AccessGesture } from "@renderer/stores/access";
import { Callout } from "../ui/callout";
import { ErrorNotice } from "../ui/error-notice";

const COPIED = {
  header: "access.key.copied.header",
  key: "access.key.copied.key",
  link: "access.key.copied.link",
} as const;

/** What the last copy of this key did, said under it. */
export function AccessCopied({
  gesture,
  id,
}: {
  gesture: AccessGesture;
  id: string;
}) {
  const t = useTranslations();

  if (gesture.status === "copied" && gesture.id === id) {
    return (
      <Callout name="access-copied" tone="ok">
        {t(COPIED[gesture.form])}
      </Callout>
    );
  }

  if (gesture.status === "failed" && gesture.id === id) {
    return <ErrorNotice error={gesture.error} name="access-refused" />;
  }

  return null;
}
