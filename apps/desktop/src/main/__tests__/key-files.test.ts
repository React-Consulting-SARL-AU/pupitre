import { describe, expect, it } from "bun:test";
import { designatedKeyFile, designateKeyFile } from "../key-files";

describe("les fichiers de clé désignés", () => {
  it("ne tient pour désigné que ce que le sélecteur a rendu", () => {
    expect(designatedKeyFile("/home/j/.ssh/vps")).toBe(false);

    expect(designateKeyFile("/home/j/.ssh/vps")).toBe("/home/j/.ssh/vps");

    expect(designatedKeyFile("/home/j/.ssh/vps")).toBe(true);
    expect(designatedKeyFile("/home/j/.ssh/vps.pub")).toBe(false);
    expect(designatedKeyFile(null)).toBe(false);
  });

  it("refuse un chemin qui n'est pas absolu", () => {
    expect(designateKeyFile("")).toBeNull();
    expect(designateKeyFile(".ssh/vps")).toBeNull();
    expect(designateKeyFile(undefined)).toBeNull();
    expect(designatedKeyFile(".ssh/vps")).toBe(false);
  });
});
