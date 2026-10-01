import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attentionWatcher, newlyWaiting, waitingIn } from "../attention";
import { preferencesStore } from "../preferences";

function harness(over: { focused?: boolean; allowed?: boolean } = {}) {
  const badges: number[] = [];
  const notified: string[] = [];

  return {
    badges,
    notified,
    watch: attentionWatcher({
      allowed: () => over.allowed ?? true,
      badge: (count) => badges.push(count),
      focused: () => over.focused ?? false,
      notify: (id) => notified.push(id),
    }),
  };
}

describe("sessions that are waiting", () => {
  it("are counted, and only those that just switched are signalled", () => {
    expect(waitingIn({ a: "attention", b: "working", c: "attention" })).toEqual(
      ["a", "c"]
    );
    expect(
      newlyWaiting(
        { a: "attention", b: "working" },
        { a: "attention", b: "attention" }
      )
    ).toEqual(["b"]);
  });

  it("paint the badge on every read and notify a switch once", () => {
    const seen = harness();

    seen.watch({ a: "working" });
    seen.watch({ a: "attention" });
    seen.watch({ a: "attention", b: "attention" });
    seen.watch({ a: "idle", b: "attention" });
    seen.watch({});

    expect(seen.badges).toEqual([0, 1, 2, 1, 0]);
    expect(seen.notified).toEqual(["a", "b"]);
  });

  it("do not notify a foreground window, but still count", () => {
    const seen = harness({ focused: true });

    seen.watch({ a: "attention" });

    expect(seen.badges).toEqual([1]);
    expect(seen.notified).toEqual([]);
  });

  it("stay silent when the person turned notifications off", () => {
    const seen = harness({ allowed: false });

    seen.watch({ a: "attention" });

    expect(seen.badges).toEqual([1]);
    expect(seen.notified).toEqual([]);
  });
});

describe("the notifications preference", () => {
  it("defaults to yes, is written with its revision and read back", () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "pupitre-prefs-")),
      "preferences.json"
    );
    const store = preferencesStore(file);

    expect(store.read().notifications).toBe(true);

    store.set({ notifications: false });

    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      launchAtLogin: false,
      notifications: false,
      version: 2,
    });
    expect(preferencesStore(file).read().notifications).toBe(false);
  });

  it("carries a first-revision file, which said nothing about startup", () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "pupitre-prefs-")),
      "preferences.json"
    );

    writeFileSync(file, JSON.stringify({ notifications: false, version: 1 }));

    const store = preferencesStore(file);

    expect(store.read()).toEqual({
      launchAtLogin: false,
      notifications: false,
    });
    expect(existsSync(`${file}.r1`)).toBe(true);

    store.set({ launchAtLogin: true });

    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      launchAtLogin: true,
      notifications: false,
      version: 2,
    });
    expect(preferencesStore(file).read().launchAtLogin).toBe(true);
  });

  it("reads a file from a newer version without rewriting it", () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "pupitre-prefs-")),
      "preferences.json"
    );

    writeFileSync(file, JSON.stringify({ notifications: false, version: 7 }));

    const store = preferencesStore(file);

    store.set({ notifications: true });

    expect(store.read().notifications).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      notifications: false,
      version: 7,
    });
  });
});
