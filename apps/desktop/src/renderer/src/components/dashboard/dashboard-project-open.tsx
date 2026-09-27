import { Button } from "@renderer/components/ui/button";
import { Menu } from "@renderer/components/ui/menu";
import { useTranslations } from "@renderer/i18n/use-translations";
import { openAddress } from "@renderer/lib/open-address";
import type { LiveAddress } from "@renderer/lib/project-addresses";
import { ExternalLink } from "lucide-react";

export function DashboardProjectOpen({
  addresses,
}: {
  addresses: readonly LiveAddress[];
}) {
  const t = useTranslations();

  const [only] = addresses;

  if (!only) {
    return null;
  }

  if (addresses.length === 1) {
    return (
      <Button
        icon={ExternalLink}
        onClick={() => openAddress(only.url)}
        size="sm"
      >
        {t("dashboard.card.open")}
      </Button>
    );
  }

  return (
    <Menu
      data-open="menu"
      entries={addresses.map((address) => ({
        detail: address.hostname,
        id: address.url,
        label: address.label,
      }))}
      icon={ExternalLink}
      label={t("dashboard.card.open")}
      onPick={(url) => openAddress(url)}
      trigger="button"
    />
  );
}
