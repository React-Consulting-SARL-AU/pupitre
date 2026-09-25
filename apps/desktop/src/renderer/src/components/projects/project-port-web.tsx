import { useTranslations } from "@renderer/i18n/use-translations";
import { Wand2 } from "lucide-react";
import { CheckBox } from "../ui/check-box";
import { controlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";

export function ProjectPortWeb({
  name,
  labelledBy,
  publish,
  value,
  placeholder,
  wrong,
  onPublish,
  onChange,
  onGenerate,
}: {
  name: string;
  labelledBy: string;
  publish: boolean;
  value: string;
  placeholder: string;
  wrong: boolean;
  onPublish: (value: boolean) => void;
  onChange: (value: string) => void;
  onGenerate: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <CheckBox
        checked={publish}
        label={t("projectAdd.ports.publish")}
        name={`${name}.publish`}
        onChange={onPublish}
      />

      {publish ? (
        <>
          <input
            aria-describedby={wrong ? `${name}.web-problem` : undefined}
            aria-invalid={wrong ? true : undefined}
            aria-labelledby={labelledBy}
            className={`${controlClass("data", wrong)} min-w-0 flex-1`}
            id={`${name}.web`}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            value={value}
          />

          <IconButton
            icon={Wand2}
            label={t("projectAdd.form.subdomainGenerate")}
            onClick={onGenerate}
            variant="discreet"
          />
        </>
      ) : (
        <span className="text-ink-3 text-small">
          {t("projectAdd.ports.local")}
        </span>
      )}
    </div>
  );
}
