import { describe, expect, it } from "bun:test";
import { useGestureFailure } from "../../stores/gesture-failure";
import { awaited, reportFailure } from "../use-pending";

describe("the work a gesture started", () => {
  it("waits for nothing from a gesture that has already done everything", () => {
    const seen: boolean[] = [];

    expect(awaited(undefined, (pending) => seen.push(pending))).toBeNull();
    expect(awaited(42, (pending) => seen.push(pending))).toBeNull();
    expect(seen).toEqual([]);
  });

  it("waits for a promise until it settles", async () => {
    const seen: boolean[] = [];

    await awaited(Promise.resolve("ok"), (pending) => seen.push(pending));

    expect(seen).toEqual([true, false]);
  });

  it("releases the button on a failure, and returns the failure instead of swallowing it", async () => {
    const seen: boolean[] = [];
    const failure = new Error("the bridge did not answer");

    const outcome = awaited(Promise.reject(failure), (pending) =>
      seen.push(pending)
    );

    await expect(outcome).rejects.toBe(failure);
    expect(seen).toEqual([true, false]);
  });

  it("shows the failure no screen caught, instead of leaving it to the screen reader alone", () => {
    useGestureFailure.getState().dismiss();

    reportFailure(new Error("the bridge did not answer"));

    expect(useGestureFailure.getState().failure).toEqual({
      count: 1,
      text: "L'action s'est arrêtée sur une erreur : the bridge did not answer",
    });

    reportFailure("again");

    expect(useGestureFailure.getState().failure?.count).toBe(2);

    useGestureFailure.getState().dismiss();

    expect(useGestureFailure.getState().failure).toBeNull();
  });
});
