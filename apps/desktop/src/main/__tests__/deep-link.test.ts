import { describe, expect, it } from "bun:test";
import { deepLinkArgument, parseDeepLink } from "../deep-link";

const deps = {
  declares: (serverId: string, project: string) =>
    serverId === "srv-1" && project === "flyleaf-api",
  knows: (serverId: string) => serverId === "srv-1",
};

describe("a pupitre:// link", () => {
  it("names a known server", () => {
    expect(parseDeepLink("pupitre://server/srv-1", deps)).toEqual({
      kind: "server",
      serverId: "srv-1",
    });
  });

  it("names a project that this server's agent has declared", () => {
    expect(parseDeepLink("pupitre://project/srv-1/flyleaf-api", deps)).toEqual({
      kind: "project",
      name: "flyleaf-api",
      serverId: "srv-1",
    });
  });

  it("carries only the approved device from the platform's response", () => {
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

  it("refuses an unknown server, an undeclared project and an unknown shape", () => {
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

  it("refuses another scheme and anything that is not an address", () => {
    expect(parseDeepLink("https://server/srv-1", deps)).toBeNull();
    expect(parseDeepLink("not a url", deps)).toBeNull();
    expect(parseDeepLink("pupitre://server/srv%201", deps)).toBeNull();
  });

  it("is found among the arguments of a second launch", () => {
    expect(
      deepLinkArgument(["/app/Pupitre", "--flag", "pupitre://server/srv-1"])
    ).toBe("pupitre://server/srv-1");
    expect(deepLinkArgument(["/app/Pupitre"])).toBeNull();
  });
});
