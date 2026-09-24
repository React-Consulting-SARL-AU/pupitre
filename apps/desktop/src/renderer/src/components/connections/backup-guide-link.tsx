import { useTranslations } from "@renderer/i18n/use-translations";
import { ExternalLink } from "lucide-react";

/** The site's guide to creating a bucket and its key, opened in the browser. */
export function BackupGuideLink() {
  const t = useTranslations();

  return (
    <div>
      <a
        className="clickable inline-flex items-center gap-1.5 text-[12px] text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
        href={t("backups.guideUrl")}
        onClick={(event) => {
          event.preventDefault();
          window.pupitre.openUrl(t("backups.guideUrl"));
        }}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink aria-hidden="true" size={12} strokeWidth={1.5} />
        {t("backups.guide")}
      </a>
    </div>
  );
}
