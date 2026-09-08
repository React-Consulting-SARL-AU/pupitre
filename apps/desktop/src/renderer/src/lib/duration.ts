import { translate } from "@renderer/i18n/translate";
import { decimal } from "./format";

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MEGABYTE = 1_000_000;

/**
 * A duration the eye can compare at a glance.
 *
 * Under a minute it stays in seconds with one decimal, because that is where
 * the difference between two steps shows; past that, the decimal is noise and
 * the minutes are what the reader is waiting on.
 */
export function humanMs(ms: number): string {
  const t = translate();
  const second = t("format.unit.second");
  const minute = t("format.unit.minute");

  if (ms < MINUTE_MS) {
    return `${decimal(ms / SECOND_MS)} ${second}`;
  }

  if (ms < HOUR_MS) {
    const minutes = Math.floor(ms / MINUTE_MS);

    return `${minutes} ${minute} ${Math.round((ms - minutes * MINUTE_MS) / SECOND_MS)} ${second}`;
  }

  const hours = Math.floor(ms / HOUR_MS);

  return `${hours} ${t("format.unit.hour")} ${Math.round((ms - hours * HOUR_MS) / MINUTE_MS)} ${minute}`;
}

export function humanBytes(bytes: number): string {
  return `${decimal(bytes / MEGABYTE)} ${translate()("format.unit.mb")}`;
}
