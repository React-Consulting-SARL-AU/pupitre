import type { WorkflowStep } from "cloudflare:workers"

export interface StepRecorder {
  names: string[]
  step: WorkflowStep
}

export function recordSteps(): StepRecorder {
  const names: string[] = []
  const step = {
    do(name: string, ...rest: unknown[]) {
      names.push(name)

      const callback = rest.find((argument) => typeof argument === "function")

      return (callback as () => Promise<unknown>)()
    },
  }

  return { names, step: step as unknown as WorkflowStep }
}
