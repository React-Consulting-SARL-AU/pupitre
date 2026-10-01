import { describe, expect, it } from "bun:test";
import { designatedKeyFile, designateKeyFile } from "../key-files";

describe("designated key files", () => {
  it("only treats as designated what the picker returned", () => {
    expect(designatedKeyFile("/home/j/.ssh/vps")).toBe(false);

    expect(designateKeyFile("/home/j/.ssh/vps")).toBe("/home/j/.ssh/vps");

    expect(designatedKeyFile("/home/j/.ssh/vps")).toBe(true);
    expect(designatedKeyFile("/home/j/.ssh/vps.pub")).toBe(false);
    expect(designatedKeyFile(null)).toBe(false);
  });

  it("refuses a path that is not absolute", () => {
    expect(designateKeyFile("")).toBeNull();
    expect(designateKeyFile(".ssh/vps")).toBeNull();
    expect(designateKeyFile(undefined)).toBeNull();
    expect(designatedKeyFile(".ssh/vps")).toBe(false);
  });
});
