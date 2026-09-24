import type { Manifest } from "@pupitre/shared/catalog";
import { Callout } from "@renderer/components/ui/callout";
import { CheckLine } from "@renderer/components/ui/check-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ContentsState } from "@renderer/stores/backups";
import { BackupsContentFields } from "./backups-content-fields";

/** The last step: what backups carry, and whether a first one runs right away. */
export function BackupsSetupContent({
  manifest,
  contents,
  docker,
  runFirst,
  problemOf,
  onRunFirst,
  onRetryContents,
}: {
  manifest: Manifest;
  contents: ContentsState;
  /** Docker runs here, and its volumes are not in any backup. */
  docker: boolean;
  runFirst: boolean;
  problemOf: (key: string) => string | undefined;
  onRunFirst: (next: boolean) => void;
  onRetryContents: () => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <>
      <BackupsContentFields
        contents={contents}
        manifest={manifest}
        onRetryContents={onRetryContents}
        problemOf={problemOf}
      />

      {docker ? (
        <Callout name="backup-docker" tone="warn">
          {t("backups.status.docker")}
        </Callout>
      ) : null}

      <div className="border-line border-t pt-5">
        <CheckLine
          checked={runFirst}
          label={t("backups.setup.runFirst")}
          name="backup-run-first"
          onChange={onRunFirst}
        />
      </div>
    </>
  );
}
