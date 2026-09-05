import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AccountIdentity } from "@shared/account";
import { ExternalLink } from "lucide-react";

/**
 * The organizations this account belongs to, and which one is active.
 *
 * It appears only where there is something to choose between: a single
 * organization is already named by the account panel, and a selector of one is
 * noise. The switch itself belongs to the console — `GET /me` names the
 * organizations and the active one, and the API has no route for the desktop
 * to move it. Saying so is better than a control that would do nothing.
 */
export function FleetOrganizations({
  identity,
  consoleUrl,
}: {
  identity: AccountIdentity;
  consoleUrl: string;
}) {
  const t = useTranslations();

  if (identity.organizations.length < 2) {
    return null;
  }

  return (
    <div className="rounded-md border border-line bg-surface px-4 py-4">
      <Label>{t("fleet.organizations.heading")}</Label>

      <ul className="mt-3 flex flex-col gap-2">
        {identity.organizations.map((organization) => (
          <li className="flex items-center gap-2" key={organization.id}>
            <StatusDot
              shape={
                organization.id === identity.organization?.id
                  ? "filled"
                  : "empty"
              }
              size={10}
            />
            <span className="min-w-0 truncate text-ink-2">
              {organization.name}
            </span>
            <span className="font-data text-[11px] text-ink-4">
              {organization.role}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-line border-t pt-3 text-[11px] text-ink-4 leading-relaxed">
        {t("fleet.organizations.note")}
      </p>

      <div className="mt-3">
        <Button
          icon={ExternalLink}
          onClick={() => window.pupitre.openUrl(consoleUrl)}
          size="sm"
          variant="discreet"
        >
          {t("fleet.organizations.switch")}
        </Button>
      </div>
    </div>
  );
}
