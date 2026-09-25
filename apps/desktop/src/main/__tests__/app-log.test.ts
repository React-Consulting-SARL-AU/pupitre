import { describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appLog } from "../app-log";

function folder(): string {
  return join(mkdtempSync(join(tmpdir(), "pupitre-log-")), "logs");
}

describe("le journal des pannes du processus principal", () => {
  it("écrit la panne, sa pile, en 0600", () => {
    const dir = folder();
    const log = appLog({ dir, now: () => Date.UTC(2026, 8, 25, 10) });

    log.failure("uncaught", new Error("le canal est tombé"));

    const text = readFileSync(log.path, "utf8");

    expect(text).toStartWith("2026-09-25T10:00:00.000Z uncaught ");
    expect(text).toContain("le canal est tombé");
    expect(text).toContain("stack");
    expect(statSync(log.path).mode & 0o777).toBe(0o600);
  });

  it("n'écrit ni jeton ni mot de passe glissés dans un message", () => {
    const log = appLog({ dir: folder() });

    log.failure(
      "unhandled",
      new Error("401 on /me with Bearer pup_live_abc123 and password=hunter2")
    );

    const text = readFileSync(log.path, "utf8");

    expect(text).not.toContain("pup_live_abc123");
    expect(text).not.toContain("hunter2");
  });

  it("tourne passé sa taille et ne garde que les derniers", () => {
    const dir = folder();
    const log = appLog({ dir, kept: 2, maxBytes: 200 });

    for (let index = 0; index < 12; index += 1) {
      log.failure("uncaught", `panne ${index}`);
    }

    expect(readdirSync(dir).sort()).toEqual([
      "main.1.log",
      "main.2.log",
      "main.log",
    ]);
    expect(readFileSync(join(dir, "main.log"), "utf8")).toContain("panne 11");
  });
});
