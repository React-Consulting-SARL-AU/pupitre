import { describe, expect, it } from "bun:test";
import {
  choiceOf,
  historyOf,
  numberOf,
  startsAtHour,
} from "../backup-schedule";

describe("backup frequency", () => {
  it("names the usual intervals, and files the others apart", () => {
    expect(choiceOf(24)).toBe("24");
    expect(choiceOf(0)).toBe("0");
    expect(choiceOf(48)).toBe("custom");
  });

  it("asks for a start time only from one day up", () => {
    expect(startsAtHour(12)).toBe(false);
    expect(startsAtHour(24)).toBe(true);
  });

  it("states retention as a duration, in the unit a reader would use", () => {
    expect(historyOf(6, 4)).toEqual({ count: 24, unit: "hours" });
    expect(historyOf(24, 14)).toEqual({ count: 14, unit: "days" });
    expect(historyOf(24, 60)).toEqual({ count: 9, unit: "weeks" });
  });

  it("reads a number as the agent sends it or as it is typed", () => {
    expect(numberOf(12, 24)).toBe(12);
    expect(numberOf("6", 24)).toBe(6);
    expect(numberOf(undefined, 24)).toBe(24);
    expect(numberOf("abc", 24)).toBe(24);
  });
});
