import { useTranslations } from "@renderer/i18n/use-translations";
import { Wand2 } from "lucide-react";
import { CheckBox } from "../ui/check-box";
import { controlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";

/**
 * What a port is on the web: nothing, or a name.
 *
 * The switch and the name share one cell, because they are one decision: a
 * port that is published has a name, and a port that has no name is not
 * published. A name the server already stored shows whole, as it answers; a
 * new one is a subdomain the agent completes with the server's domain.
 */
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
  /** The id of the row, so a form of several rows keeps each control addressable. */
  name: string;
  /** The caption of the column, which the head of the table carries. */
  labelledBy: string;
  publish: boolean;
  value: string;
  placeholder: string;
  /** The name is refused, and the row says why beneath itself. */
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
        <span className="text-[12px] text-ink-3">
          {t("projectAdd.ports.local")}
        </span>
      )}
    </div>
  );
}
