import { describe, expect, it } from "bun:test";
import { deepLinkArgument, parseDeepLink } from "../deep-link";

const deps = {
  declares: (serverId: string, project: string) =>
    serverId === "srv-1" && project === "flyleaf-api",
  knows: (serverId: string) => serverId === "srv-1",
};

describe("un lien pupitre://", () => {
  it("nomme un serveur connu", () => {
    expect(parseDeepLink("pupitre://server/srv-1", deps)).toEqual({
      kind: "server",
      serverId: "srv-1",
    });
  });

  it("nomme un projet que l'agent de ce serveur a déclaré", () => {
    expect(parseDeepLink("pupitre://project/srv-1/flyleaf-api", deps)).toEqual({
      kind: "project",
      name: "flyleaf-api",
      serverId: "srv-1",
    });
  });

  it("ne porte de la réponse de la plateforme que l'appareil approuvé", () => {
    expect(
      parseDeepLink("pupitre://account/callback?code=abc&state=xyz", deps)
    ).toEqual({ kind: "account", query: {} });
    expect(
      parseDeepLink(
        "pupitre://account/callback?device=approved&token=secret",
        deps
      )
    ).toEqual({ kind: "account", query: { device: "approved" } });
  });

  it("refuse un serveur inconnu, un projet non déclaré et une forme inconnue", () => {
    expect(parseDeepLink("pupitre://server/srv-9", deps)).toBeNull();
    expect(parseDeepLink("pupitre://project/srv-1/autre", deps)).toBeNull();
    expect(
      parseDeepLink("pupitre://project/srv-9/flyleaf-api", deps)
    ).toBeNull();
    expect(parseDeepLink("pupitre://project/srv-1", deps)).toBeNull();
    expect(parseDeepLink("pupitre://server/srv-1/extra", deps)).toBeNull();
    expect(parseDeepLink("pupitre://reboot/srv-1", deps)).toBeNull();
    expect(parseDeepLink("pupitre://account/other", deps)).toBeNull();
  });

  it("refuse un autre schéma et ce qui n'est pas une adresse", () => {
    expect(parseDeepLink("https://server/srv-1", deps)).toBeNull();
    expect(parseDeepLink("not a url", deps)).toBeNull();
    expect(parseDeepLink("pupitre://server/srv%201", deps)).toBeNull();
  });

  it("se retrouve parmi les arguments d'un second lancement", () => {
    expect(
      deepLinkArgument(["/app/Pupitre", "--flag", "pupitre://server/srv-1"])
    ).toBe("pupitre://server/srv-1");
    expect(deepLinkArgument(["/app/Pupitre"])).toBeNull();
  });
});
