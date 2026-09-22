/**
 * What a busy PTY emits, held for one frame before it crosses the bridge.
 *
 * A `docker build` writes hundreds of chunks a second; sent one by one, each
 * is a structured-clone message the renderer pays for, and every open
 * terminal hears all of them. Joined per session over a frame, the same bytes
 * cross as a fraction of the messages, in order and uncut.
 */
export interface TerminalBatch {
  push(id: string, chunk: string): void;
  flush(): void;
  drop(id: string): void;
}

export const TERMINAL_FLUSH_AFTER_MS = 16;

/** Past this, the frame is cut short rather than let the buffer grow. */
export const TERMINAL_FLUSH_ABOVE_BYTES = 262_144;

export function createTerminalBatch(
  send: (id: string, data: string) => void,
  {
    waitMs = TERMINAL_FLUSH_AFTER_MS,
    maxBytes = TERMINAL_FLUSH_ABOVE_BYTES,
  }: { waitMs?: number; maxBytes?: number } = {}
): TerminalBatch {
  const chunks = new Map<string, string[]>();
  let buffered = 0;
  let timer: NodeJS.Timeout | null = null;

  function flush(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    for (const [id, parts] of chunks) {
      send(id, parts.join(""));
    }

    chunks.clear();
    buffered = 0;
  }

  return {
    push(id, chunk) {
      let parts = chunks.get(id);

      if (!parts) {
        parts = [];
        chunks.set(id, parts);
      }

      parts.push(chunk);
      buffered += chunk.length;

      if (buffered >= maxBytes) {
        flush();

        return;
      }

      if (!timer) {
        timer = setTimeout(flush, waitMs);
        timer.unref?.();
      }
    },
    flush,
    drop(id) {
      const parts = chunks.get(id);

      if (parts) {
        buffered -= parts.reduce((size, part) => size + part.length, 0);
        chunks.delete(id);
      }
    },
  };
}
