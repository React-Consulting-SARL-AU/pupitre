import { describe, expect, it } from "bun:test";
import { noteServer } from "../completion";

describe("l'historique des commandes tapées", () => {
  it("ne reste pas sur le disque : ce qu'une version précédente y a laissé part", () => {
    window.localStorage.setItem(
      "pupitre.history.v1",
      JSON.stringify({ "srv-1": ["export TOKEN=ghp_secret"] })
    );

    noteServer("srv-1");

    expect(window.localStorage.getItem("pupitre.history.v1")).toBeNull();

    noteServer(null);
  });
});
