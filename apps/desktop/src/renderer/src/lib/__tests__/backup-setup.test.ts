import { describe, expect, it } from "bun:test";
import { stepOfField } from "../backup-setup";

describe("les étapes de la mise en place des sauvegardes", () => {
  it("renvoient un refus à l'étape qui tient son champ", () => {
    expect(stepOfField("keep")).toBe("frequency");
    expect(stepOfField("exclude_databases")).toBe("content");
    expect(stepOfField("bucket")).toBe("bucket");
    expect(stepOfField("")).toBe("bucket");
  });
});
