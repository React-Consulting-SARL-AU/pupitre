/**
 * A read repeated on a beat, one at a time.
 *
 * The next turn is scheduled once the answer has landed, never on a clock of
 * its own: a server that takes four seconds to answer a three-second poll would
 * otherwise pile its answers up, and the last to land is not always the last
 * asked. A hidden window asks for nothing — what nobody is looking at need not
 * be fresh — and coming back reads at once. Stopping cancels the beat and lets
 * an answer in flight fall on the floor.
 */
export function poll(read: () => Promise<void>, everyMs: number): () => void {
  let live = true;
  let reading = false;
  let next: ReturnType<typeof setTimeout> | null = null;

  function hidden(): boolean {
    return typeof document !== "undefined" && document.hidden;
  }

  async function turn(): Promise<void> {
    if (!live || reading || hidden()) {
      return;
    }

    reading = true;

    try {
      await read();
    } finally {
      reading = false;

      if (live && !hidden()) {
        next = setTimeout(turn, everyMs);
      }
    }
  }

  function onVisibility(): void {
    if (next) {
      clearTimeout(next);
      next = null;
    }

    turn();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }

  turn();

  return () => {
    live = false;

    if (next) {
      clearTimeout(next);
    }

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}
