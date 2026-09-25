import { BACKUP_PASSPHRASE_MIN } from "@shared/backups";

export type PassphraseProblem = "short" | "mismatch";

export function passphraseProblem(
  passphrase: string,
  confirm: string
): PassphraseProblem | null {
  if (passphrase.trim().normalize("NFC").length < BACKUP_PASSPHRASE_MIN) {
    return "short";
  }

  return passphrase === confirm ? null : "mismatch";
}

export interface PhraseDraft {
  passphrase: string;
  confirm: string;
  /** Null once the fields no longer hold the phrase the app drew. */
  drawn: string | null;
  noted: boolean;
}

export const NO_PHRASE: PhraseDraft = {
  confirm: "",
  drawn: null,
  noted: false,
  passphrase: "",
};

export function phraseReady(phrase: PhraseDraft): boolean {
  return (
    passphraseProblem(phrase.passphrase, phrase.confirm) === null &&
    (phrase.drawn === null || phrase.noted)
  );
}

// No look-alikes (0/o, 1/l/i) so the phrase survives being copied by hand.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const GROUPS = 6;

const GROUP_LENGTH = 4;

// Bytes past the last whole round of the alphabet are redrawn so no letter is favoured.
const FAIR_LIMIT = 256 - (256 % ALPHABET.length);

function drawIndexes(count: number): number[] {
  const kept: number[] = [];

  while (kept.length < count) {
    for (const byte of crypto.getRandomValues(new Uint8Array(count))) {
      if (byte < FAIR_LIMIT && kept.length < count) {
        kept.push(byte % ALPHABET.length);
      }
    }
  }

  return kept;
}

export function drawPassphrase(): string {
  const letters = drawIndexes(GROUPS * GROUP_LENGTH).map(
    (index) => ALPHABET[index]
  );

  return Array.from({ length: GROUPS }, (_, group) =>
    letters.slice(group * GROUP_LENGTH, (group + 1) * GROUP_LENGTH).join("")
  ).join("-");
}
