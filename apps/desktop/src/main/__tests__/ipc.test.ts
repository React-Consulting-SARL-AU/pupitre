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

describe("le cadre qui appelle", () => {
  it("est la page de l'app, dans son cadre du haut", () => {
    expect(fromOwnPage(OWN)).toBe(true);
    expect(fromOwnPage(ELSEWHERE)).toBe(false);
    expect(fromOwnPage({ ...OWN, parent: OWN })).toBe(false);
    expect(fromOwnPage(null)).toBe(false);
  });
});

describe("un canal gardé", () => {
  const ran: unknown[][] = [];
  const rename = guarded(
    "server-rename",
    shape(isString, isString),
    (_event: unknown, id, name) => {
      ran.push([id, name]);

      return "renamed";
    }
  );

  it("répond quand la forme est la bonne", () => {
    expect(rename({ senderFrame: OWN }, "srv-1", "Atelier")).toBe("renamed");
    expect(ran).toEqual([["srv-1", "Atelier"]]);
  });

  it("refuse une autre forme ou un autre cadre, sans rien faire", () => {
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

describe("ce que le formulaire d'ajout envoie", () => {
  const DRAFT = {
    host: "203.0.113.10",
    key: { mode: "generate" },
    name: "Atelier",
    port: 22,
    user: "root",
  };

  it("passe quand il a la forme d'un brouillon", () => {
    expect(isServerDraft(DRAFT)).toBe(true);
    expect(
      isServerDraft({
        ...DRAFT,
        key: { file: "/k", mode: "import" },
        password: null,
      })
    ).toBe(true);
  });

  it("est refusé quand un champ manque ou n'a pas son type", () => {
    expect(isServerDraft({ ...DRAFT, port: "22" })).toBe(false);
    expect(isServerDraft({ ...DRAFT, port: 70_000 })).toBe(false);
    expect(isServerDraft({ ...DRAFT, key: { mode: "import" } })).toBe(false);
    expect(isServerDraft({ ...DRAFT, key: { mode: "other" } })).toBe(false);
    expect(isServerDraft({ ...DRAFT, password: 1 })).toBe(false);
    expect(isServerDraft(null)).toBe(false);
  });

  it("frappe à une adresse qui a la forme d'une adresse", () => {
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
