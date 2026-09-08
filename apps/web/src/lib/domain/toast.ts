import { createContext } from "react"

export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastFailure {
  title: string
  fix?: string | null
  /** `null` offers nothing; `undefined` lets the caller's default stand. */
  action?: ToastAction | null
}

export interface Toasts {
  /** One sentence, in the past tense, naming the thing that just happened. */
  done: (title: string, description?: string) => void
  /** What failed, the remedy, and the gesture that tries again. */
  failed: (failure: ToastFailure) => void
}

/** Outside the console shell nobody listens: a toast falls silently. */
export const SILENT_TOASTS: Toasts = {
  done: () => undefined,
  failed: () => undefined,
}

export const ToastContext = createContext<Toasts>(SILENT_TOASTS)
