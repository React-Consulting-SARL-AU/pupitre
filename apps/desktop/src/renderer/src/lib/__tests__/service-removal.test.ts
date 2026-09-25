import { describe, expect, it } from "bun:test";
import {
  CORE_SYSTEM,
  DB_POSTGRES,
  EDITOR_JETBRAINS,
  RUNTIME_JAVA,
  RUNTIME_NODE,
} from "../../__tests__/catalog-fixtures";
import { removalOf } from "../service-removal";

const INSTALLED = [
  CORE_SYSTEM,
  RUNTIME_JAVA,
  RUNTIME_NODE,
  DB_POSTGRES,
  EDITOR_JETBRAINS,
];

function target(manifest: (typeof INSTALLED)[number]) {
  return { id: manifest.id, manifest, name: manifest.name };
}

describe("ce que retirer un module fait perdre", () => {
  it("nomme les données de la catégorie du module", () => {
    const removal = removalOf(target(DB_POSTGRES), INSTALLED);

    expect(removal.allowed).toBe(true);
    expect(removal.losses).toContain(
      "Les bases de données de ce moteur, leurs comptes et leurs mots de passe."
    );
  });

  it("dit que les secrets envoyés ne reviendront pas", () => {
    const removal = removalOf(target(DB_POSTGRES), INSTALLED);

    expect(
      removal.losses.some((loss) => loss.includes("secrets envoyés"))
    ).toBe(true);
  });

  it("nomme les modules installés qui en dépendent", () => {
    const removal = removalOf(target(RUNTIME_JAVA), INSTALLED);

    expect(removal.dependents.map((module) => module.id)).toEqual([
      "editor.jetbrains",
    ]);
    expect(
      removal.losses.some((loss) => loss.includes("JetBrains Gateway"))
    ).toBe(true);
  });

  it("refuse ce que le catalogue déclare obligatoire", () => {
    const removal = removalOf(target(CORE_SYSTEM), INSTALLED);

    expect(removal.allowed).toBe(false);
    expect(removal.refusal).toContain("obligatoire");
  });

  it("garde une facture pour un module que le catalogue ne déclare plus", () => {
    const removal = removalOf(
      { id: "db.clickhouse", manifest: null, name: "ClickHouse" },
      INSTALLED
    );

    expect(removal.allowed).toBe(true);
    expect(removal.losses).toEqual([
      "ClickHouse et ce que ce service a posé sur le serveur.",
    ]);
  });
});
