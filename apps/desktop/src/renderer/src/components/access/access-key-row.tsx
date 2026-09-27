import type { AccessKey } from "@pupitre/shared/agent-protocol/access";
import { useTranslations } from "@renderer/i18n/use-translations";
import { scopeLabel } from "@renderer/lib/access";
import { dated } from "@renderer/lib/format";
import type { AccessCopyForm } from "@shared/access";
import { Copy, Link, Monitor, Trash2, Type } from "lucide-react";
import { ConfirmButton } from "../ui/confirm-button";
import { IconButton } from "../ui/icon-button";
import { Menu } from "../ui/menu";

type CopyChoice = `link:${string}` | "header" | "key";

export function AccessKeyRow({
  accessKey,
  device,
  held,
  hostnames,
  onCopy,
  onRevoke,
}: {
  accessKey: AccessKey;
  device: boolean;
  held: boolean;
  /** The protected names this key opens, one link each. */
  hostnames: readonly string[];
  onCopy: (form: AccessCopyForm, hostname: string | null) => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const t = useTranslations();

  const entries = [
    ...hostnames.map((hostname) => ({
      icon: Link,
      id: `link:${hostname}` as CopyChoice,
      label: t("access.key.copyLink", { hostname }),
    })),
    {
      icon: Type,
      id: "header" as CopyChoice,
      label: t("access.key.copyHeader"),
    },
    { icon: Copy, id: "key" as CopyChoice, label: t("access.key.copyKey") },
  ];

  function pick(choice: CopyChoice) {
    if (choice === "header" || choice === "key") {
      onCopy(choice, null);

      return;
    }

    onCopy("link", choice.slice("link:".length));
  }

  return (
    <li
      className="flex items-center gap-4 px-5 py-3.5"
      data-access-key={accessKey.id}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-control text-ink">
            {accessKey.name}
          </span>
          {device ? (
            <span className="label inline-flex shrink-0 items-center gap-1 text-ink-3">
              <Monitor aria-hidden="true" size={11} strokeWidth={1.5} />
              {t("access.key.device")}
            </span>
          ) : null}
        </span>
        <span className="truncate text-ink-3 text-small">
          <span className="font-data">{scopeLabel(t, accessKey)}</span>
          <span aria-hidden="true" className="px-1.5 text-ink-4">
            ·
          </span>
          {t("access.key.created", { date: dated(accessKey.created_at) })}
        </span>
      </span>

      {held ? (
        <Menu
          data-access-copy={accessKey.id}
          entries={entries}
          icon={Copy}
          label={t("access.key.copy", { name: accessKey.name })}
          onPick={pick}
        />
      ) : (
        <IconButton
          disabled
          icon={Copy}
          label={t("access.key.elsewhere")}
          variant="discreet"
        />
      )}

      <ConfirmButton
        ariaLabel={t("access.key.revoke", { name: accessKey.name })}
        confirmLabel={t("access.key.revokeConfirm")}
        icon={Trash2}
        onConfirm={onRevoke}
        question={t("access.key.revokeQuestion", { name: accessKey.name })}
        size="sm"
        variant="discreet"
      >
        {t("access.key.revokeConfirm")}
      </ConfirmButton>
    </li>
  );
}
