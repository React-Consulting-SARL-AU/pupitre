import type { Translate } from "@renderer/i18n/i18n";
import { ALL_SHOTS, UNFILED } from "@renderer/stores/shots";

export function folderLabel(t: Translate, folder: string): string {
  if (folder === ALL_SHOTS) {
    return t("shots.folder.all");
  }

  return folder === UNFILED ? t("shots.folder.unfiled") : folder;
}
