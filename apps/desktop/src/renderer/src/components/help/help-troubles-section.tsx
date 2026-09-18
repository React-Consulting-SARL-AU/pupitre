import { Callout } from "@renderer/components/ui/callout";
import { Panel } from "@renderer/components/ui/panel";
import { FoldingSection } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { HelpTarget } from "./help-screen";

/** The three ways a door stays shut, each with what opens it. */
export function HelpTroublesSection({ target }: { target: HelpTarget }) {
  const t = useTranslations();

  const troubles = [
    {
      fix: t("help.troubles.password.fix"),
      message: t("help.troubles.password"),
      name: "password",
    },
    {
      fix: t("help.troubles.notFound.fix", { ssh: target.host }),
      message: t("help.troubles.notFound"),
      name: "not-found",
    },
    {
      fix: t("help.troubles.hostKey.fix"),
      message: t("help.troubles.hostKey"),
      name: "host-key",
    },
  ];

  return (
    <FoldingSection name="help-troubles" title={t("help.troubles.title")}>
      <Panel inset="lg">
        <div className="flex flex-col gap-4">
          {troubles.map((trouble) => (
            <Callout
              bare
              fix={trouble.fix}
              key={trouble.name}
              name={`help-trouble-${trouble.name}`}
              tone="warn"
            >
              {trouble.message}
            </Callout>
          ))}
        </div>
      </Panel>
    </FoldingSection>
  );
}
