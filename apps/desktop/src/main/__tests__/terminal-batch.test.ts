import { describe, expect, it } from "bun:test";

import { createTerminalBatch } from "../terminal-batch";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function recorder(options: { waitMs: number; maxBytes?: number }) {
  const sent: { id: string; data: string }[] = [];
  const batch = createTerminalBatch(
    (id, data) => sent.push({ id, data }),
    options
  );

  return { batch, sent };
}

describe("createTerminalBatch", () => {
  it("sends a lone echo at once, without waiting for the frame", () => {
    const { batch, sent } = recorder({ waitMs: 50 });

    batch.push("a", "x");

    expect(sent).toEqual([{ id: "a", data: "x" }]);
  });

  it("joins what follows within a frame into a single send per session", async () => {
    const { batch, sent } = recorder({ waitMs: 5 });

    batch.push("a", "first");
    batch.push("a", "hel");
    batch.push("a", "lo");
    batch.push("b", "other");

    expect(sent).toEqual([{ id: "a", data: "first" }]);

    await sleep(20);

    expect(sent).toEqual([
      { id: "a", data: "first" },
      { id: "a", data: "hello" },
      { id: "b", data: "other" },
    ]);
  });

  it("sends at once again after a quiet frame", async () => {
    const { batch, sent } = recorder({ waitMs: 5 });

    batch.push("a", "x");
    await sleep(20);
    batch.push("a", "y");

    expect(sent).toEqual([
      { id: "a", data: "x" },
      { id: "a", data: "y" },
    ]);
  });

  it("cuts the frame short once the buffer grows past its ceiling", () => {
    const { batch, sent } = recorder({ maxBytes: 10, waitMs: 50 });

    batch.push("a", "x");
    batch.push("a", "0123456789");

    expect(sent).toEqual([
      { id: "a", data: "x" },
      { id: "a", data: "0123456789" },
    ]);

    batch.push("a", "y");

    expect(sent).toHaveLength(2);
  });

  it("flushes on demand, so a session's last bytes leave before its exit", () => {
    const { batch, sent } = recorder({ waitMs: 50 });

    batch.push("a", "x");
    batch.push("a", "bye");
    batch.flush();

    expect(sent).toEqual([
      { id: "a", data: "x" },
      { id: "a", data: "bye" },
    ]);
  });

  it("forgets a dropped session without sending what it buffered", async () => {
    const { batch, sent } = recorder({ waitMs: 5 });

    batch.push("a", "x");
    batch.push("gone", "never delivered");
    batch.drop("gone");

    await sleep(20);

    expect(sent).toEqual([{ id: "a", data: "x" }]);
  });
});
