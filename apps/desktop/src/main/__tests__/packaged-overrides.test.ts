import { describe, expect, it } from "bun:test";
import { harnessOn } from "../dev-data-run";
import {
  agentPlatformUrlOf,
  DEFAULT_PLATFORM_URL,
  LOCAL_PLATFORM_URL,
  platformUrlOf,
} from "../platform-client";

const PACKAGED = () => true;
const FROM_FOLDER = () => false;

describe("what the environment may change in a packaged build", () => {
  it("only lets a scenario drive the app from a development folder", () => {
    expect(harnessOn("1", FROM_FOLDER)).toBe(true);
    expect(harnessOn("1", PACKAGED)).toBe(false);
    expect(harnessOn(undefined, FROM_FOLDER)).toBe(false);
  });

  it("does not ask whether the app is packaged when no scenario is requested", () => {
    expect(
      harnessOn(undefined, () => {
        throw new Error("asked");
      })
    ).toBe(false);
  });

  it("talks to the hosted platform, whatever PUPITRE_PLATFORM_URL says", () => {
    expect(platformUrlOf(true, "https://evil.example")).toBe(
      DEFAULT_PLATFORM_URL
    );
    expect(platformUrlOf(true, undefined)).toBe(DEFAULT_PLATFORM_URL);
  });

  it("follows PUPITRE_PLATFORM_URL in development, the local console otherwise", () => {
    expect(platformUrlOf(false, "https://app.pupitre.studio")).toBe(
      "https://app.pupitre.studio"
    );
    expect(platformUrlOf(false, undefined)).toBe(LOCAL_PLATFORM_URL);
    expect(platformUrlOf(false, "")).toBe(LOCAL_PLATFORM_URL);
  });

  it("gives the agent the app's platform once packaged", () => {
    expect(
      agentPlatformUrlOf(true, "https://evil.example", DEFAULT_PLATFORM_URL)
    ).toBe(new URL("/api/v1", DEFAULT_PLATFORM_URL).toString());
    expect(
      agentPlatformUrlOf(
        false,
        "https://agent.example",
        "https://app.pupitre.studio"
      )
    ).toBe("https://agent.example/api/v1");
  });
});
