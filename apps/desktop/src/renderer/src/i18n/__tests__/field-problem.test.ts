import { describe, expect, it } from "bun:test";
import type { Manifest } from "@pupitre/shared/catalog";
import { strayProblems } from "../field-problem";
import { translator } from "../i18n";

const t = translator("fr");

const MANIFEST = {
  fields: [
    { key: "bucket", kind: "text", label: "Seau", managed: true },
    { key: "keep", kind: "number", label: "Sauvegardes gardées" },
  ],
  id: "core.backup",
} as unknown as Manifest;

describe("un refus qu'aucun champ du formulaire ne porte", () => {
  it("est dit avec le nom du champ qu'il vise, jamais réduit à un nombre", () => {
    const stray = strayProblems(
      t,
      [
        { code: "required", field: "bucket", module: "core.backup" },
        { code: "max", expected: "365", field: "keep", module: "core.backup" },
        {
          code: "connection",
          field: "",
          message: "Le seau refuse l'écriture d'essai.",
          module: "core.backup",
        },
      ],
      ["keep"],
      MANIFEST
    );

    expect(stray).toEqual([
      "Seau : Ce champ est obligatoire.",
      "Le seau refuse l'écriture d'essai.",
    ]);
  });
});
