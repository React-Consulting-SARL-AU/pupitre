import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Boxes } from "lucide-react";

/** Whether the tool a client expects on the server is there, as the snapshot says. */
export function HelpModuleLine({
  module,
  server,
  installed,
  onServices,
}: {
  module: string;
  server: string;
  installed: boolean;
  onServices: () => void;
}) {
  const t = useTranslations();

  if (installed) {
    return (
      <Callout bare name={`help-module-${module}`} tone="ok">
        {t("help.module.installed", { module, server })}
      </Callout>
    );
  }

  return (
    <Callout
      action={
        <Button icon={Boxes} onClick={onServices} size="sm">
          {t("help.module.open")}
        </Button>
      }
      bare
      fix={t("help.module.missing.fix")}
      name={`help-module-${module}`}
      tone="warn"
    >
      {t("help.module.missing", { module, server })}
    </Callout>
  );
}
