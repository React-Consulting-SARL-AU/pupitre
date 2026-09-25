import { useTranslations } from "@renderer/i18n/use-translations";
import { FileKey2 } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";

const NAME = "servers.add.keyFile";

export function ServerAddKeyFileField({
  file,
  problem,
  onPick,
}: {
  file: string;
  problem?: string;
  onPick: () => void;
}) {
  const t = useTranslations();

  const described = [`${NAME}-file`, problem ? `${NAME}-problem` : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <fieldset
      aria-describedby={described}
      className="flex min-w-0 flex-col gap-2"
      data-wrong={problem ? "true" : undefined}
    >
      <legend className="mb-2">
        <Label>{t("servers.add.keyFile.label")}</Label>
      </legend>

      <div className="flex items-center gap-2">
        <Button icon={FileKey2} onClick={onPick}>
          {t("servers.add.pickFile")}
        </Button>
        <span
          className="min-w-0 truncate font-data text-[12px] text-ink-3"
          id={`${NAME}-file`}
        >
          {file || t("servers.add.noFile")}
        </span>
      </div>

      {problem ? (
        <span
          className="text-[12px] text-danger leading-relaxed"
          id={`${NAME}-problem`}
        >
          {problem}
        </span>
      ) : null}
    </fieldset>
  );
}
