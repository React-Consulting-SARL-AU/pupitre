import { Field, proseControlClass } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import { roleLabel } from "@renderer/lib/roles";
import type { AccountIdentity } from "@shared/account";
import { Users } from "lucide-react";
import { useState } from "react";

/**
 * The organization the server is about to be enrolled for.
 *
 * The console files a server under the organization active on this computer
 * at the moment the agent is sent, and that moment comes without a question:
 * this card says it beforehand, and lets the reader change it while there is
 * still something to change.
 */
export function OnboardingOrganizationNote({
  identity,
  onSwitch,
}: {
  identity: AccountIdentity;
  onSwitch: (organizationId: string) => Promise<void>;
}) {
  const t = useTranslations();

  const [switching, setSwitching] = useState(false);

  const organization = identity.organization;

  async function pick(organizationId: string): Promise<void> {
    setSwitching(true);

    try {
      await onSwitch(organizationId);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-md border border-line bg-surface px-4 py-4"
      data-enrolling-for={organization?.id}
    >
      <div className="flex items-start gap-3">
        <Users
          className="shrink-0 translate-y-0.5 text-ink-3"
          size={15}
          strokeWidth={1.5}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            {organization
              ? t("onboarding.organization.title", {
                  organization: organization.name,
                })
              : t("onboarding.organization.none")}
          </p>
          {organization ? null : (
            <p className="mt-1 text-ink-3 leading-relaxed">
              {t("onboarding.organization.noneDetail")}
            </p>
          )}
          {organization && identity.role ? (
            <p className="mt-1 text-[12px] text-ink-3">
              {t("onboarding.organization.role", {
                role: roleLabel(t, identity.role),
              })}
            </p>
          ) : null}
        </div>
      </div>

      {identity.organizations.length > 1 ? (
        <Field
          label={t("onboarding.organization.switchLabel")}
          name="onboarding.organization"
        >
          <select
            aria-busy={switching}
            className={proseControlClass}
            disabled={switching}
            id="onboarding.organization"
            onChange={(event) => pick(event.target.value)}
            value={organization?.id ?? ""}
          >
            {organization ? null : <option value="">—</option>}
            {identity.organizations.map((membership) => (
              <option key={membership.id} value={membership.id}>
                {membership.name} · {roleLabel(t, membership.role)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </div>
  );
}
