import { createContext } from "react"

export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastFailure {
  title: string
  fix?: string | null
  // `null` offers nothing; `undefined` lets the caller's default stand.
  action?: ToastAction | null
}

export interface Toasts {
  done: (title: string, description?: string) => void
  failed: (failure: ToastFailure) => void
}

// Outside the console shell nobody listens: a toast falls silently.
export const SILENT_TOASTS: Toasts = {
  done: () => undefined,
  failed: () => undefined,
}

export const ToastContext = createContext<Toasts>(SILENT_TOASTS)
