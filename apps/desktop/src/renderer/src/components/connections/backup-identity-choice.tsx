import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Skeleton } from "@renderer/components/ui/skeleton";
import { SwitchLine } from "@renderer/components/ui/switch";
import { useTranslations } from "@renderer/i18n/use-translations";
import { dated } from "@renderer/lib/format";
import type { IdentityState } from "@renderer/stores/backup-connection";

export function BackupIdentityChoice({
  held,
  identity,
  renewing,
  onRenew,
}: {
  held: boolean;
  identity: IdentityState;
  renewing: boolean;
  onRenew: (next: boolean) => void;
}) {
  const t = useTranslations();

  const adoptable =
    !held && identity.status === "read" ? identity.identity : null;

  if (!held && identity.status === "reading") {
    return <Skeleton className="h-10" />;
  }

  return (
    <>
      {adoptable ? (
        <Callout>
          {t("backups.passphrase.adopted", {
            date: dated(adoptable.created_at),
            server: adoptable.server_name,
          })}
        </Callout>
      ) : null}

      {!held && identity.status === "failed" ? (
        <ErrorNotice bare error={identity.error} />
      ) : null}

      {held || adoptable ? (
        <SwitchLine
          checked={renewing}
          detail={t("backups.passphrase.renewDetail")}
          label={t(
            held ? "backups.passphrase.renew" : "backups.passphrase.own"
          )}
          name="backup-passphrase-renew"
          onChange={onRenew}
        />
      ) : null}
    </>
  );
}
