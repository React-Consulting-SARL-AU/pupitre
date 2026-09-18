import type { Project } from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";

/**
 * The project the server already declares where the draft points — at this
 * folder, or under this name. The way on is to open it, not to declare it
 * again, so the notice carries that gesture.
 */
export function ProjectAddDeclared({
  declared,
  onOpen,
}: {
  declared: Project;
  onOpen: (name: string) => void;
}) {
  const t = useTranslations();

  return (
    <Callout
      action={
        <Button
          icon={ArrowRight}
          onClick={() => onOpen(declared.name)}
          size="sm"
        >
          {t("projectAdd.panel.open")}
        </Button>
      }
      name="declared"
      tone="warn"
    >
      {t("projectAdd.form.alreadyDeclared", { name: declared.name })}
    </Callout>
  );
}
