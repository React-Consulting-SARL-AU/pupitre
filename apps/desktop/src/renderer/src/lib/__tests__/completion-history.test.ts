import { describe, expect, it } from "bun:test";
import { noteServer } from "../completion";

describe("the history of typed commands", () => {
  it("does not stay on disk: what a previous version left there goes away", () => {
    window.localStorage.setItem(
      "pupitre.history.v1",
      JSON.stringify({ "srv-1": ["export TOKEN=ghp_secret"] })
    );

    noteServer("srv-1");

    expect(window.localStorage.getItem("pupitre.history.v1")).toBeNull();

    noteServer(null);
  });
});
