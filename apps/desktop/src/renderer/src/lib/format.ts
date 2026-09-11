import { currentLocale, translate } from "@renderer/i18n/translate";

/**
 * The numbers of the interface, in the reader's language.
 *
 * The agent answers in megabytes, gigabytes and seconds; nothing is converted
 * beyond what makes a figure legible at a glance, and nothing is rounded away
 * that the reader would miss. The unit words and the decimal mark follow the
 * chosen locale.
 */

const MB_PER_GB = 1024;

const MINUTE_S = 60;

const HOUR_S = 3600;

const DAY_S = 86_400;

const EMPTY = "—";

export function decimal(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);

  return currentLocale() === "fr" ? fixed.replace(".", ",") : fixed;
}

export function memory(mb: number | undefined): string {
  if (!mb) {
    return EMPTY;
  }

  const t = translate();

  return mb >= MB_PER_GB
    ? `${decimal(mb / MB_PER_GB)} ${t("format.unit.gb")}`
    : `${mb} ${t("format.unit.mb")}`;
}

export function gigabytes(mb: number): string {
  return `${decimal(mb / MB_PER_GB, mb >= 10 * MB_PER_GB ? 0 : 1)} ${translate()("format.unit.gb")}`;
}

export function disk(gb: number): string {
  return `${decimal(gb, gb >= 10 ? 0 : 1)} ${translate()("format.unit.gb")}`;
}

/** A figure shown as it was measured, with only the decimal mark localised. */
export function measured(value: number): string {
  return decimal(value, Number.isInteger(value) ? 0 : 1);
}

export function uptime(seconds: number | undefined): string {
  if (!seconds) {
    return EMPTY;
  }

  const t = translate();

  if (seconds < MINUTE_S) {
    return `${Math.round(seconds)} ${t("format.unit.second")}`;
  }

  if (seconds < HOUR_S) {
    return `${Math.floor(seconds / MINUTE_S)} ${t("format.unit.minute")}`;
  }

  if (seconds < DAY_S) {
    return `${Math.floor(seconds / HOUR_S)} ${t("format.unit.hour")}`;
  }

  return `${Math.floor(seconds / DAY_S)} ${t("format.unit.day")}`;
}

/** How long ago something was read, for a value the reader may want refreshed. */
export function since(timestampMs: number): string {
  const seconds = Math.max(0, (Date.now() - timestampMs) / 1000);
  const t = translate();

  if (seconds < MINUTE_S) {
    return t("format.since.now");
  }

  if (seconds < HOUR_S) {
    return t("format.since.minutes", { count: Math.round(seconds / MINUTE_S) });
  }

  if (seconds < DAY_S) {
    return t("format.since.hours", { count: Math.round(seconds / HOUR_S) });
  }

  return t("format.since.days", { count: Math.round(seconds / DAY_S) });
}

const BYTES_PER_KB = 1024;

/** A file's weight, the way a reader judges whether it is worth keeping. */
export function weight(bytes: number): string {
  const t = translate();
  const kb = bytes / BYTES_PER_KB;

  if (kb < 1) {
    return `${bytes} ${t("format.unit.byte")}`;
  }

  if (kb < BYTES_PER_KB) {
    return `${Math.round(kb)} ${t("format.unit.kb")}`;
  }

  const mb = kb / BYTES_PER_KB;

  return mb < BYTES_PER_KB
    ? `${decimal(mb)} ${t("format.unit.mb")}`
    : `${decimal(mb / BYTES_PER_KB, 2)} ${t("format.unit.gb")}`;
}

/** A transfer's pace, a weight per second. */
export function rate(bytesPerSecond: number): string {
  return `${weight(bytesPerSecond)}/${translate()("format.unit.second")}`;
}
