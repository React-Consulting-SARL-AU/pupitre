/** D1 binds at most a hundred values in one statement, and Prisma adds its own to an `in` list. */
export const D1_BATCH_SIZE = 90

export function inBatches<T>(items: readonly T[]): T[][] {
  const batches: T[][] = []

  for (let start = 0; start < items.length; start += D1_BATCH_SIZE) {
    batches.push(items.slice(start, start + D1_BATCH_SIZE))
  }

  return batches
}

/** Runs until a batch comes back short, so each run must move its rows out of its own filter. */
export async function drainBatches<T>(
  size: number,
  run: () => Promise<T[]>
): Promise<T[]> {
  const drained: T[] = []

  for (;;) {
    const batch = await run()

    drained.push(...batch)

    if (batch.length < size) {
      return drained
    }
  }
}

export interface CursorBatch {
  next: string | null
}

/** Cursor-based, for batches that leave their rows in place. */
export async function walkBatches<B extends CursorBatch>(
  run: (after: string | null) => Promise<B>
): Promise<B[]> {
  const batches: B[] = []
  let after: string | null = null

  do {
    const batch: B = await run(after)

    batches.push(batch)
    after = batch.next
  } while (after !== null)

  return batches
}
