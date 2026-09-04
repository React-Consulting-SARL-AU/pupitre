/**
 * The numbers of the interface, written the way they are read in French.
 *
 * The agent answers in megabytes, gigabytes and seconds; nothing is converted
 * beyond what makes a figure legible at a glance, and nothing is rounded away
 * that the reader would miss.
 */

const MB_PER_GB = 1024;

const MINUTE_S = 60;

const HOUR_S = 3600;

const DAY_S = 86_400;

function comma(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

export function memory(mb: number | undefined): string {
  if (!mb) {
    return "—";
  }

  return mb >= MB_PER_GB ? `${comma(mb / MB_PER_GB)} Go` : `${mb} Mo`;
}

export function gigabytes(mb: number): string {
  return `${comma(mb / MB_PER_GB, mb >= 10 * MB_PER_GB ? 0 : 1)} Go`;
}

export function disk(gb: number): string {
  return `${comma(gb, gb >= 10 ? 0 : 1)} Go`;
}

export function uptime(seconds: number | undefined): string {
  if (!seconds) {
    return "—";
  }

  if (seconds < MINUTE_S) {
    return `${Math.round(seconds)} s`;
  }

  if (seconds < HOUR_S) {
    return `${Math.floor(seconds / MINUTE_S)} min`;
  }

  if (seconds < DAY_S) {
    return `${Math.floor(seconds / HOUR_S)} h`;
  }

  return `${Math.floor(seconds / DAY_S)} j`;
}

/** How long ago something was read, for a value the reader may want refreshed. */
export function since(timestampMs: number): string {
  const seconds = Math.max(0, (Date.now() - timestampMs) / 1000);

  if (seconds < MINUTE_S) {
    return "à l'instant";
  }

  if (seconds < HOUR_S) {
    return `il y a ${Math.round(seconds / MINUTE_S)} min`;
  }

  if (seconds < DAY_S) {
    return `il y a ${Math.round(seconds / HOUR_S)} h`;
  }

  return `il y a ${Math.round(seconds / DAY_S)} j`;
}

export function commits(count: number): string {
  return `${count} commit${count > 1 ? "s" : ""}`;
}

const BYTES_PER_KB = 1024;

/** A file's weight, the way a reader judges whether it is worth keeping. */
export function weight(bytes: number): string {
  const kb = bytes / BYTES_PER_KB;

  if (kb < 1) {
    return `${bytes} o`;
  }

  return kb < BYTES_PER_KB
    ? `${Math.round(kb)} Ko`
    : `${comma(kb / BYTES_PER_KB)} Mo`;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}
