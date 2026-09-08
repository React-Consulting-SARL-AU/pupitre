import { useContext } from "react"
import { ToastContext, type Toasts } from "@/lib/domain/toast"

export function useToast(): Toasts {
  return useContext(ToastContext)
}
