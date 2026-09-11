/**
 * A read repeated on a beat, one at a time.
 *
 * The next turn is scheduled once the answer has landed, never on a clock of
 * its own: a server that takes four seconds to answer a three-second poll would
 * otherwise pile its answers up, and the last to land is not always the last
 * asked. Stopping cancels the beat and lets an answer in flight fall on the
 * floor.
 */
export function poll(read: () => Promise<void>, everyMs: number): () => void {
  let live = true;
  let next: ReturnType<typeof setTimeout> | null = null;

  async function turn(): Promise<void> {
    try {
      await read();
    } finally {
      if (live) {
        next = setTimeout(turn, everyMs);
      }
    }
  }

  turn();

  return () => {
    live = false;

    if (next) {
      clearTimeout(next);
    }
  };
}
