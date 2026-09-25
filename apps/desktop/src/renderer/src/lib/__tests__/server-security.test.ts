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

describe("un serveur à sécuriser", () => {
  it("est un serveur de l'app sur lequel l'app parle encore en root", () => {
    expect(needsSecuring({ ...SERVER, user: "root" })).toBe("root");
    expect(needsSecuring({ ...SERVER, user: "root" }, "nopasswd_all")).toBe(
      "root"
    );
    expect(needsSecuring(SERVER)).toBe(null);
  });

  it("est un serveur où dev devient encore root sans mot de passe", () => {
    expect(needsSecuring(SERVER, "nopasswd_all")).toBe("sudo");
    expect(needsSecuring(SERVER, "password")).toBe(null);
  });

  it("n'est jamais un hôte du système, dont le compte n'est pas à l'app", () => {
    expect(needsSecuring({ ...SERVER, origin: "system", user: "root" })).toBe(
      null
    );
    expect(needsSecuring({ ...SERVER, origin: "system" }, "nopasswd_all")).toBe(
      null
    );
    expect(needsSecuring(null)).toBe(null);
  });
});
