import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import { roleLabel } from "@renderer/lib/roles";
import { useAccount } from "@renderer/stores/account";
import type { AccountIdentity } from "@shared/account";

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
    <Section name="organizations" title={t("fleet.organizations.heading")}>
      <Panel as="ul" className="flex flex-col gap-2">
        {identity.organizations.map((organization) => {
          const active = organization.id === identity.organization?.id;

          return (
            <li className="flex items-center gap-2" key={organization.id}>
              <StatusDot shape={active ? "filled" : "empty"} size={10} />
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {organization.name}
              </span>
              <span className="text-ink-3 text-small">
                {roleLabel(t, organization.role)}
              </span>

              {active ? (
                <span className="text-ink-3 text-small">
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
      </Panel>
    </Section>
  );
}
