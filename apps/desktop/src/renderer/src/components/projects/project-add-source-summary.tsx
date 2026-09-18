import { useTranslations } from "@renderer/i18n/use-translations";
import { PencilLine } from "lucide-react";
import type { DetectionState, Draft } from "../../stores/project-add";
import { Button } from "../ui/button";
import { Fact, FactList } from "../ui/fact";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import { ProjectAddSourceStatus } from "./project-add-source-status";

/**
 * The source, once settled: what the configuration was read from.
 *
 * The repository and its branch, or the folder, stay in sight above the
 * fields they filled in, with what the agent read there. Changing them is
 * the section's own gesture, and it goes back to the first page of the form.
 */
export function ProjectAddSourceSummary({
  draft,
  detection,
  onEdit,
}: {
  draft: Pick<Draft, "kind" | "source" | "branch">;
  detection: DetectionState;
  onEdit: () => void;
}) {
  const t = useTranslations();

  const branch = draft.branch.trim();

  return (
    <Section
      actions={
        <Button icon={PencilLine} onClick={onEdit} size="sm" variant="discreet">
          {t("projectAdd.form.editSource")}
        </Button>
      }
      name="source"
      title={t("projectAdd.section.source")}
    >
      <Panel className="flex flex-col gap-4" inset="lg">
        <FactList>
          {draft.kind === "dir" ? (
            <Fact data-source="dir" label={t("projectAdd.summary.dir")}>
              {draft.source}
            </Fact>
          ) : (
            <>
              <Fact data-source="repo" label={t("projectAdd.summary.repo")}>
                {draft.source}
              </Fact>
              <Fact
                data-source="branch"
                label={t("projectAdd.form.branchLabel")}
                prose={branch.length === 0}
              >
                {branch.length > 0
                  ? branch
                  : t("projectAdd.summary.defaultBranch")}
              </Fact>
            </>
          )}
        </FactList>

        <ProjectAddSourceStatus detection={detection} kind={draft.kind} />
      </Panel>
    </Section>
  );
}
