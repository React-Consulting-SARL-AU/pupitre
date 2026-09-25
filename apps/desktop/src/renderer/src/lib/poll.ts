export interface PollPage {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

function currentPage(): PollPage | null {
  return typeof document === "undefined" ? null : document;
}

/** Schedules after each answer, never on a fixed clock, so slow answers cannot pile up out of order. */
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
