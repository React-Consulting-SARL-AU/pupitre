import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useAccount } from "@renderer/stores/account";
import type { AccountIdentity } from "@shared/account";

/**
 * The organizations this account belongs to, and which one is active.
 *
 * It appears only where there is something to choose between: a single
 * organization is already named by the account panel, and a selector of one is
 * noise. The switch moves this computer's session and nothing else — the
 * console open next to it keeps the organization it was on.
 */
export function FleetOrganizations({
  identity,
}: {
  identity: AccountIdentity;
}) {
  const t = useTranslations();
  const switchOrganization = useAccount((store) => store.switchOrganization);

  if (identity.organizations.length < 2) {
    return null;
  }

  return (
    <div className="rounded-md border border-line bg-surface px-4 py-4">
      <Label>{t("fleet.organizations.heading")}</Label>

      <ul className="mt-3 flex flex-col gap-2">
        {identity.organizations.map((organization) => {
          const active = organization.id === identity.organization?.id;

          return (
            <li className="flex items-center gap-2" key={organization.id}>
              <StatusDot shape={active ? "filled" : "empty"} size={10} />
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {organization.name}
              </span>
              <span className="font-data text-[12px] text-ink-4">
                {organization.role}
              </span>

              {active ? (
                <span className="text-[12px] text-ink-4">
                  {t("fleet.organizations.active")}
                </span>
              ) : (
                <Button
                  onClick={() => switchOrganization(organization.id)}
                  size="sm"
                  variant="discreet"
                >
                  {t("fleet.organizations.switch")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 border-line border-t pt-3 text-[12px] text-ink-4 leading-relaxed">
        {t("fleet.organizations.note")}
      </p>
    </div>
  );
}
