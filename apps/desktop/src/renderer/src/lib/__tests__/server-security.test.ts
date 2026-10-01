import { describe, expect, it } from "bun:test";
import type { Server } from "@shared/servers";
import { needsSecuring } from "../server-security";

const SERVER: Server = {
  host: "203.0.113.10",
  id: "srv-1",
  name: "atelier",
  origin: "app",
  port: 22,
  user: "dev",
};

describe("a server to harden", () => {
  it("is an app server the app still talks to as root", () => {
    expect(needsSecuring({ ...SERVER, user: "root" })).toBe("root");
    expect(needsSecuring({ ...SERVER, user: "root" }, "nopasswd_all")).toBe(
      "root"
    );
    expect(needsSecuring(SERVER)).toBe(null);
  });

  it("is a server where dev still becomes root without a password", () => {
    expect(needsSecuring(SERVER, "nopasswd_all")).toBe("sudo");
    expect(needsSecuring(SERVER, "password")).toBe(null);
  });

  it("is never a system host, whose account does not belong to the app", () => {
    expect(needsSecuring({ ...SERVER, origin: "system", user: "root" })).toBe(
      null
    );
    expect(needsSecuring({ ...SERVER, origin: "system" }, "nopasswd_all")).toBe(
      null
    );
    expect(needsSecuring(null)).toBe(null);
  });
});
