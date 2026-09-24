import { describe, expect, it } from "bun:test";
import {
  choiceOf,
  historyOf,
  numberOf,
  startsAtHour,
} from "../backup-schedule";

describe("la fréquence des sauvegardes", () => {
  it("nomme les intervalles usuels, et range les autres à part", () => {
    expect(choiceOf(24)).toBe("24");
    expect(choiceOf(0)).toBe("0");
    expect(choiceOf(48)).toBe("custom");
  });

  it("ne demande une heure de départ qu'à partir d'un jour", () => {
    expect(startsAtHour(12)).toBe(false);
    expect(startsAtHour(24)).toBe(true);
  });

  it("dit la rétention en temps, à l'unité qu'un lecteur emploierait", () => {
    expect(historyOf(6, 4)).toEqual({ count: 24, unit: "hours" });
    expect(historyOf(24, 14)).toEqual({ count: 14, unit: "days" });
    expect(historyOf(24, 60)).toEqual({ count: 9, unit: "weeks" });
  });

  it("lit un nombre tel que l'agent l'envoie ou tel qu'il est tapé", () => {
    expect(numberOf(12, 24)).toBe(12);
    expect(numberOf("6", 24)).toBe(6);
    expect(numberOf(undefined, 24)).toBe(24);
    expect(numberOf("abc", 24)).toBe(24);
  });
});
