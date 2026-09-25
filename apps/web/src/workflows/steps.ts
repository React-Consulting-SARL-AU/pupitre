import type { WorkflowStep } from "cloudflare:workers"

// One step per batch, so a retry never replays the batches already done.
export function batchStep(name: string, index: number): string {
  return `${name}-${index + 1}`
}

// For batches that leave the filter they were drawn from; stops on a short batch.
export async function drainInSteps<T extends Rpc.Serializable<T>>(
  step: WorkflowStep,
  name: string,
  size: number,
  run: () => Promise<T[]>
): Promise<T[]> {
  const drained: T[] = []

  for (let index = 0; ; index += 1) {
    const batch: T[] = await step.do(batchStep(name, index), run)

    drained.push(...batch)

    if (batch.length < size) {
      return drained
    }
  }
}

export interface CursorBatch {
  next: string | null
}

// Cursor-based, for rows a batch may leave in place.
export async function walkInSteps<B extends CursorBatch & Rpc.Serializable<B>>(
  step: WorkflowStep,
  name: string,
  run: (after: string | null) => Promise<B>
): Promise<B[]> {
  const batches: B[] = []
  let after: string | null = null

  for (let index = 0; ; index += 1) {
    const from: string | null = after
    const batch: B = await step.do(batchStep(name, index), () => run(from))

    batches.push(batch)
    after = batch.next

    if (after === null) {
      return batches
    }
  }
}

// One step per slice: only a failed slice is tried again.
export async function sliceInSteps<T, R extends Rpc.Serializable<R>>(
  step: WorkflowStep,
  name: string,
  items: T[],
  size: number,
  run: (slice: T[]) => Promise<R>
): Promise<R[]> {
  const results: R[] = []

  for (let index = 0; index * size < items.length; index += 1) {
    const slice = items.slice(index * size, (index + 1) * size)

    results.push(await step.do(batchStep(name, index), () => run(slice)))
  }

  return results
}
