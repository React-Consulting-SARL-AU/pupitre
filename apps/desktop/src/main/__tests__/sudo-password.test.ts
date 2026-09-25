import { describe, expect, it } from "bun:test";
import { SUDO_PASSWORD_HASH_PATTERN } from "@pupitre/shared/agent-protocol/install";
import {
  drawSudoPassword,
  hashSudoPassword,
  SUDO_HASH_ROUNDS,
  sha512Crypt,
} from "../sudo-password";

const HASH = new RegExp(SUDO_PASSWORD_HASH_PATTERN);

describe("l'empreinte SHA-512 crypt du mot de passe sudo", () => {
  it("rend ce que rendent glibc et openssl passwd -6", () => {
    expect(sha512Crypt("Hello world!", "saltstring")).toBe(
      "$6$saltstring$svn8UoSVapNtMuq1ukKS4tPQd8iKwSMHWjl/O817G3uBnIFNjnQJuesI68u4OTLiBFdcbYEdFCoEOfaS35inz1"
    );
    expect(sha512Crypt("Hello world!", "saltstringsaltstring", 10_000)).toBe(
      "$6$rounds=10000$saltstringsaltst$OW1/O6BYHV6BcXZu8QVeXbDWra3Oeqh0sbHbbMCVNSnCM/UrjmM0Dp8vOuZeHBy/YTBmSK6H9qs/y3RnOaw5v."
    );
    expect(sha512Crypt("This is just a test", "toolongsaltstring", 5000)).toBe(
      "$6$rounds=5000$toolongsaltstrin$lQ8jolhgVRVhY4b5pZKaysCLi0QBxGoNeKQzQ3glMhwllF7oGDZxUhx1yxdYcz/e1JSbq3y6JMxxl8audkUEm0"
    );
    expect(
      sha512Crypt("k7mp-q2xw-9hdt-3vzc-u8fa-6rne", "Wq3vX8zYk1pL0sQe", 100_000)
    ).toBe(
      "$6$rounds=100000$Wq3vX8zYk1pL0sQe$PrJH1rPtYcXhyW28FJS0rQ7sq5jLB9mY/GZ8GL1MQMXesQF1UBBe.X8g.Z1cutPJzEeignRlhLB1GHAcUHivm."
    );
  });

  it("tire un sel neuf à chaque fois et reste une empreinte que l'agent accepte", () => {
    const first = hashSudoPassword("k7mp-q2xw-9hdt-3vzc-u8fa-6rne");
    const second = hashSudoPassword("k7mp-q2xw-9hdt-3vzc-u8fa-6rne");

    expect(first).not.toBe(second);
    expect(first.startsWith(`$6$rounds=${SUDO_HASH_ROUNDS}$`)).toBe(true);
    expect(HASH.test(first)).toBe(true);
    expect(first).not.toContain("k7mp");
  });
});

describe("le mot de passe sudo tiré sur l'ordinateur", () => {
  it("tient en six groupes de quatre, sans caractère qu'on confond", () => {
    const password = drawSudoPassword();

    expect(password).toMatch(
      /^[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}$/
    );
  });

  it("tire chaque caractère du hasard qu'on lui donne", () => {
    let next = 0;
    const password = drawSudoPassword((max) => {
      next += 1;

      return (next - 1) % max;
    });

    expect(password).toBe("2345-6789-abcd-efgh-jkmn-pqrs");
  });

  it("ne se répète pas", () => {
    const drawn = new Set(Array.from({ length: 50 }, () => drawSudoPassword()));

    expect(drawn.size).toBe(50);
  });
});
