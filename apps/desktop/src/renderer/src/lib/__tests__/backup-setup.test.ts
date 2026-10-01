import { describe, expect, it } from "bun:test";
import { stepOfField } from "../backup-setup";

describe("the backup setup steps", () => {
  it("send a refusal to the step that holds its field", () => {
    expect(stepOfField("keep")).toBe("frequency");
    expect(stepOfField("exclude_databases")).toBe("content");
    expect(stepOfField("bucket")).toBe("bucket");
    expect(stepOfField("")).toBe("bucket");
  });
});
