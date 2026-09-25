import { createHash, randomInt } from "node:crypto";

/** No look-alike characters: six groups of four give about 119 bits and stay readable over the phone. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

const GROUPS = 6;

const GROUP_LENGTH = 4;

const CRYPT_ALPHABET =
  "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const SALT_LENGTH = 16;

const DEFAULT_ROUNDS = 5000;

/** A few dozen milliseconds per sudo check on the server. */
export const SUDO_HASH_ROUNDS = 100_000;

/** Digest bytes per four-character group, in glibc's order. */
const ENCODING_ORDER: readonly [number, number, number][] = [
  [0, 21, 42],
  [22, 43, 1],
  [44, 2, 23],
  [3, 24, 45],
  [25, 46, 4],
  [47, 5, 26],
  [6, 27, 48],
  [28, 49, 7],
  [50, 8, 29],
  [9, 30, 51],
  [31, 52, 10],
  [53, 11, 32],
  [12, 33, 54],
  [34, 55, 13],
  [56, 14, 35],
  [15, 36, 57],
  [37, 58, 16],
  [59, 17, 38],
  [18, 39, 60],
  [40, 61, 19],
  [62, 20, 41],
];

export type Draw = (max: number) => number;

const draw: Draw = (max) => randomInt(0, max);

export function drawSudoPassword(random: Draw = draw): string {
  const groups: string[] = [];

  for (let group = 0; group < GROUPS; group += 1) {
    let text = "";

    for (let index = 0; index < GROUP_LENGTH; index += 1) {
      text += ALPHABET[random(ALPHABET.length)];
    }

    groups.push(text);
  }

  return groups.join("-");
}

export function hashSudoPassword(
  password: string,
  random: Draw = draw
): string {
  let salt = "";

  for (let index = 0; index < SALT_LENGTH; index += 1) {
    salt += CRYPT_ALPHABET[random(CRYPT_ALPHABET.length)];
  }

  return sha512Crypt(password, salt, SUDO_HASH_ROUNDS);
}

function sha512(...parts: Buffer[]): Buffer {
  const hash = createHash("sha512");

  for (const part of parts) {
    hash.update(part);
  }

  return hash.digest();
}

function stretched(digest: Buffer, length: number): Buffer {
  const out = Buffer.alloc(length);

  for (let at = 0; at < length; at += digest.length) {
    digest.copy(out, at, 0, Math.min(digest.length, length - at));
  }

  return out;
}

function encode(digest: Buffer): string {
  let text = "";

  const put = (value: number, count: number) => {
    let rest = value;

    for (let index = 0; index < count; index += 1) {
      text += CRYPT_ALPHABET[rest % 64];
      rest = Math.floor(rest / 64);
    }
  };

  for (const [high, middle, low] of ENCODING_ORDER) {
    put(
      (digest[high] ?? 0) * 65_536 +
        (digest[middle] ?? 0) * 256 +
        (digest[low] ?? 0),
      4
    );
  }

  put(digest[63] ?? 0, 2);

  return text;
}

/** Drepper's SHA-512 crypt, as glibc and `chpasswd -e` read it; default rounds are left out of the output. */
export function sha512Crypt(
  password: string,
  salt: string,
  rounds?: number
): string {
  const key = Buffer.from(password, "utf8");
  const cut = salt.slice(0, SALT_LENGTH);
  const seasoning = Buffer.from(cut, "utf8");
  const turns = rounds ?? DEFAULT_ROUNDS;

  const alternate = sha512(key, seasoning, key);

  const first = createHash("sha512").update(key).update(seasoning);

  for (let left = key.length; left > 0; left -= 64) {
    first.update(alternate.subarray(0, Math.min(64, left)));
  }

  for (let bits = key.length; bits > 0; bits = Math.floor(bits / 2)) {
    first.update(bits % 2 === 1 ? alternate : key);
  }

  let current = first.digest();

  const keyed = sha512(...Array.from({ length: key.length }, () => key));
  const p = stretched(keyed, key.length);

  const salted = sha512(
    ...Array.from({ length: 16 + (current[0] ?? 0) }, () => seasoning)
  );
  const s = stretched(salted, seasoning.length);

  for (let round = 0; round < turns; round += 1) {
    const step = createHash("sha512");
    const odd = round % 2 === 1;

    step.update(odd ? p : current);

    if (round % 3 !== 0) {
      step.update(s);
    }

    if (round % 7 !== 0) {
      step.update(p);
    }

    step.update(odd ? current : p);
    current = step.digest();
  }

  const prefix = rounds === undefined ? "$6$" : `$6$rounds=${rounds}$`;

  return `${prefix}${cut}$${encode(current)}`;
}
