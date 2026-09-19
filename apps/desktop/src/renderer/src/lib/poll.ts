/** What the beat reads of the window: whether anyone is looking, and when that changes. */
export interface PollPage {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

function currentPage(): PollPage | null {
  return typeof document === "undefined" ? null : document;
}

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
export function poll(
  read: () => Promise<void>,
  everyMs: number,
  page: PollPage | null = currentPage()
): () => void {
  let live = true;
  let reading = false;
  let next: ReturnType<typeof setTimeout> | null = null;

  function hidden(): boolean {
    return page?.hidden === true;
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

  page?.addEventListener("visibilitychange", onVisibility);

  turn();

  return () => {
    live = false;

    if (next) {
      clearTimeout(next);
    }

    page?.removeEventListener("visibilitychange", onVisibility);
  };
}
