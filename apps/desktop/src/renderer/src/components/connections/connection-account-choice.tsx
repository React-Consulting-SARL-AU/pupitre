import { RadioDot } from "@renderer/components/ui/radio-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ConnectionAccount } from "@shared/connections";

/**
 * The one question a token cannot answer for itself.
 *
 * A Cloudflare token may open several accounts, and the app acts on one: its
 * zones are the ones offered for a domain, its tunnel is the one created, its
 * identifier is the one Wrangler deploys to. Taking the first the provider
 * listed left a reader with a zone list from the wrong account and nothing to
 * change it; here the account is theirs to name before anything is kept.
 */
export function ConnectionAccountChoice({
  kind,
  accounts,
  chosen,
  onChoose,
}: {
  kind: string;
  accounts: readonly ConnectionAccount[];
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  const t = useTranslations();

  return (
    <fieldset
      className="flex flex-col gap-2 rounded-md border border-line p-3"
      data-account-choice={kind}
    >
      <legend className="label px-1 text-ink-3">
        {t("connections.accounts.label")}
      </legend>

      <p className="text-[12px] text-ink-3 leading-relaxed">
        {t("connections.accounts.help")}
      </p>

      <div className="flex flex-col gap-1">
        {accounts.map((account) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: the radio is inside RadioDot, and wrapping it is what makes the whole row clickable
          <label
            className="clickable flex items-center gap-3 rounded-md px-2 py-1.5 transition-fast hover:bg-raised"
            data-account-option={account.id}
            key={account.id}
          >
            <RadioDot
              checked={chosen === account.id}
              label={account.name}
              name={`connections-${kind}-account`}
              onChange={() => onChoose(account.id)}
              value={account.id}
            />
            <span className="min-w-0">
              <span className="block text-ink">{account.name}</span>
              <span className="block truncate font-mono text-[11px] text-ink-4">
                {account.id}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
