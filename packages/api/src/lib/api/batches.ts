/** D1 binds at most a hundred values in one statement, and Prisma adds its own to an `in` list. */
export const D1_BATCH_SIZE = 90

export function inBatches<T>(items: readonly T[]): T[][] {
  const batches: T[][] = []

  for (let start = 0; start < items.length; start += D1_BATCH_SIZE) {
    batches.push(items.slice(start, start + D1_BATCH_SIZE))
  }

  return batches
}
