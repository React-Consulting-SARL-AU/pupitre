import { describe, expect, it } from "bun:test";
import {
  fromOwnPage,
  guarded,
  IpcRefused,
  isString,
  shape,
  trustPage,
} from "../ipc-guard";
import { isServerKnock } from "../knock";
import { isServerDraft } from "../server-add-run";

const PAGE = {
  devUrl: undefined,
  indexFile: "/Applications/Pupitre/index.html",
};
const OWN = { parent: null, url: "file:///Applications/Pupitre/index.html" };
const ELSEWHERE = { ...OWN, url: "https://evil.example/" };

trustPage(PAGE);

describe("the calling frame", () => {
  it("is the app page, in its top frame", () => {
    expect(fromOwnPage(OWN)).toBe(true);
    expect(fromOwnPage(ELSEWHERE)).toBe(false);
    expect(fromOwnPage({ ...OWN, parent: OWN })).toBe(false);
    expect(fromOwnPage(null)).toBe(false);
  });
});

describe("a guarded channel", () => {
  const ran: unknown[][] = [];
  const rename = guarded(
    "server-rename",
    shape(isString, isString),
    (_event: unknown, id, name) => {
      ran.push([id, name]);

      return "renamed";
    }
  );

  it("answers when the shape is right", () => {
    expect(rename({ senderFrame: OWN }, "srv-1", "Atelier")).toBe("renamed");
    expect(ran).toEqual([["srv-1", "Atelier"]]);
  });

  it("refuses another shape or another frame, doing nothing", () => {
    expect(() => rename({ senderFrame: OWN }, "srv-1", 42)).toThrow(IpcRefused);
    expect(() => rename({ senderFrame: OWN }, "srv-1", "a", "b")).toThrow(
      IpcRefused
    );
    expect(() => rename({ senderFrame: ELSEWHERE }, "a", "b")).toThrow(
      IpcRefused
    );
    expect(ran).toHaveLength(1);
  });
});

describe("what the add form sends", () => {
  const DRAFT = {
    host: "203.0.113.10",
    key: { mode: "generate" },
    name: "Atelier",
    port: 22,
    user: "root",
  };

  it("passes when it has the shape of a draft", () => {
    expect(isServerDraft(DRAFT)).toBe(true);
    expect(
      isServerDraft({
        ...DRAFT,
        key: { file: "/k", mode: "import" },
        password: null,
      })
    ).toBe(true);
  });

  it("is refused when a field is missing or has the wrong type", () => {
    expect(isServerDraft({ ...DRAFT, port: "22" })).toBe(false);
    expect(isServerDraft({ ...DRAFT, port: 70_000 })).toBe(false);
    expect(isServerDraft({ ...DRAFT, key: { mode: "import" } })).toBe(false);
    expect(isServerDraft({ ...DRAFT, key: { mode: "other" } })).toBe(false);
    expect(isServerDraft({ ...DRAFT, password: 1 })).toBe(false);
    expect(isServerDraft(null)).toBe(false);
  });

  it("knocks at an address shaped like an address", () => {
    const knock = {
      host: "203.0.113.10",
      keyFile: null,
      port: 22,
      user: "root",
    };

    expect(isServerKnock(knock)).toBe(true);
    expect(isServerKnock({ ...knock, port: 0 })).toBe(false);
    expect(isServerKnock({ ...knock, keyFile: 3 })).toBe(false);
  });
});
