import { BACKUP_PASSPHRASE_MIN } from "@shared/backups";

export type PassphraseProblem = "short" | "mismatch";

/** What stands between the two fields and a passphrase the main process will take. */
export function passphraseProblem(
  passphrase: string,
  confirm: string
): PassphraseProblem | null {
  if (passphrase.trim().normalize("NFC").length < BACKUP_PASSPHRASE_MIN) {
    return "short";
  }

  return passphrase === confirm ? null : "mismatch";
}

/** The passphrase as a form holds it until it is sent. */
export interface PhraseDraft {
  passphrase: string;
  confirm: string;
  /** The phrase the app drew, while it is the one in the fields. */
  drawn: string | null;
  noted: boolean;
}

export const NO_PHRASE: PhraseDraft = {
  confirm: "",
  drawn: null,
  noted: false,
  passphrase: "",
};

/** Whether the phrase can be sent: well formed, and noted when drawn. */
export function phraseReady(phrase: PhraseDraft): boolean {
  return (
    passphraseProblem(phrase.passphrase, phrase.confirm) === null &&
    (phrase.drawn === null || phrase.noted)
  );
}

/**
 * A passphrase drawn for the reader, to write down rather than invent.
 *
 * Six groups of four from an alphabet without look-alikes — no 0 and o, no 1,
 * l and i — so it survives being copied by hand: 120 bits, read aloud in six
 * breaths.
 */

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const GROUPS = 6;

const GROUP_LENGTH = 4;

/** 256 is not a multiple of the alphabet's length: bytes past the last whole round are drawn again. */
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
