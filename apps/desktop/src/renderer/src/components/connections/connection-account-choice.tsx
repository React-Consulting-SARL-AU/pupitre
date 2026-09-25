import { RadioGroup, RadioLine } from "@renderer/components/ui/radio";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ConnectionAccount } from "@shared/connections";

// A token may open several accounts; silently taking the first one listed showed zones from the wrong one.
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

      <p className="text-ink-3 text-small leading-relaxed">
        {t("connections.accounts.help")}
      </p>

      <RadioGroup
        label={t("connections.accounts.label")}
        name={`connections-${kind}-account`}
        onChange={onChoose}
        value={chosen ?? ""}
      >
        {accounts.map((account) => (
          <RadioLine
            data-account-option={account.id}
            detail={
              <span className="block truncate font-data text-caption text-ink-4">
                {account.id}
              </span>
            }
            key={account.id}
            label={account.name}
            value={account.id}
          />
        ))}
      </RadioGroup>
    </fieldset>
  );
}
