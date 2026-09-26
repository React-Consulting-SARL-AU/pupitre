import type {
  Shot,
  ShotsUrlResult,
} from "@pupitre/shared/agent-protocol/processes";
import { CopyField } from "@renderer/components/ui/copy-field";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { currentLocale } from "@renderer/i18n/translate";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since, weight } from "@renderer/lib/format";
import { folderLabel } from "@renderer/lib/shot-folder";
import type { ShotSize } from "@renderer/lib/shot-image";
import { folderOf, publicAddress } from "@renderer/stores/shots";

function takenAt(created: string): { when: string; ago: string | null } {
  const parsed = Date.parse(created);

  if (Number.isNaN(parsed)) {
    return { ago: null, when: created };
  }

  return {
    ago: since(parsed),
    when: new Intl.DateTimeFormat(currentLocale(), {
      dateStyle: "long",
      timeStyle: "short",
    }).format(parsed),
  };
}

export function ShotDetails({
  shot,
  size,
  mediaType,
  address,
}: {
  shot: Shot;
  size: ShotSize | null;
  mediaType: string | null;
  address: ShotsUrlResult | null;
}) {
  const t = useTranslations();

  const taken = takenAt(shot.created_at);
  const url = publicAddress(address, shot);

  return (
    <aside
      aria-label={t("shots.detailsLabel")}
      className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto"
      data-shot-details={shot.path}
    >
      <FactList columns={1}>
        <Fact label={t("shots.details.project")}>
          {folderLabel(t, folderOf(shot))}
        </Fact>
        <Fact detail={taken.ago} label={t("shots.details.taken")}>
          {taken.when}
        </Fact>
        <Fact detail={mediaType ?? undefined} label={t("shots.details.image")}>
          {size
            ? `${size.width} × ${size.height} · ${weight(shot.size_bytes)}`
            : weight(shot.size_bytes)}
        </Fact>
        <Fact label={t("shots.details.path")}>{`~/shots/${shot.path}`}</Fact>
        {url ? null : (
          <Fact label={t("shots.details.url")} prose>
            {t("shots.details.private")}
          </Fact>
        )}
      </FactList>

      {url ? <CopyField label={t("shots.details.url")} value={url} /> : null}
    </aside>
  );
}
