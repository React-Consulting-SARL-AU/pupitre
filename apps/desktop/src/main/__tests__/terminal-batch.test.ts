import { describe, expect, it } from "bun:test";

import { createTerminalBatch } from "../terminal-batch";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createTerminalBatch", () => {
  it("joins what one session wrote over a frame into a single send", async () => {
    const sent: { id: string; data: string }[] = [];
    const batch = createTerminalBatch((id, data) => sent.push({ id, data }), {
      waitMs: 5,
    });

    batch.push("a", "hel");
    batch.push("a", "lo");
    batch.push("b", "other");

    expect(sent).toEqual([]);

    await sleep(20);

    expect(sent).toEqual([
      { id: "a", data: "hello" },
      { id: "b", data: "other" },
    ]);
  });

  it("cuts the frame short once the buffer grows past its ceiling", () => {
    const sent: { id: string; data: string }[] = [];
    const batch = createTerminalBatch((id, data) => sent.push({ id, data }), {
      waitMs: 5,
      maxBytes: 10,
    });

    batch.push("a", "0123456789");

    expect(sent).toEqual([{ id: "a", data: "0123456789" }]);

    batch.push("a", "x");

    expect(sent).toHaveLength(1);
  });

  it("flushes on demand, so a session's last bytes leave before its exit", () => {
    const sent: { id: string; data: string }[] = [];
    const batch = createTerminalBatch((id, data) => sent.push({ id, data }), {
      waitMs: 5,
    });

    batch.push("a", "bye");
    batch.flush();

    expect(sent).toEqual([{ id: "a", data: "bye" }]);
  });

  it("forgets a dropped session without sending what it buffered", async () => {
    const sent: { id: string; data: string }[] = [];
    const batch = createTerminalBatch((id, data) => sent.push({ id, data }), {
      waitMs: 5,
    });

    batch.push("gone", "never delivered");
    batch.drop("gone");

    await sleep(20);

    expect(sent).toEqual([]);
  });
});
