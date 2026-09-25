import { Toast } from "@base-ui-components/react/toast"
import { X } from "lucide-react"
import { type ReactNode, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { ToastContext, type Toasts } from "@/lib/domain/toast"

export const TOAST_TIMEOUT_MS = 6000

const TOAST_LIMIT = 3

const DONE = "done"

const FAILED = "failed"

export interface ToastProviderProps {
  children: ReactNode
}

// A failure stays until read: it carries a remedy and often a retry.
export function ToastProvider({ children }: ToastProviderProps) {
  const manager = useMemo(() => Toast.createToastManager(), [])
  const toasts = useMemo<Toasts>(
    () => ({
      done: (title, description) => {
        manager.add({ title, description, type: DONE })
      },
      failed: ({ title, fix, action }) => {
        manager.add({
          title,
          description: fix ?? undefined,
          type: FAILED,
          priority: "high",
          timeout: 0,
          actionProps: action
            ? { children: action.label, onClick: action.run }
            : undefined,
        })
      },
    }),
    [manager]
  )

  return (
    <ToastContext.Provider value={toasts}>
      <Toast.Provider
        limit={TOAST_LIMIT}
        timeout={TOAST_TIMEOUT_MS}
        toastManager={manager}
      >
        {children}
        <ToastStack />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}

function ToastStack() {
  const t = useTranslations()
  const { toasts } = Toast.useToastManager()

  return (
    <Toast.Portal>
      <Toast.Viewport
        className="fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 outline-none sm:right-6 sm:bottom-6"
        data-testid="toasts"
      >
        {toasts.map((toast) => {
          const failed = toast.type === FAILED

          return (
            <Toast.Root
              className="flex items-start gap-3 rounded-md bg-surface px-4 py-3 shadow-overlay transition-soft data-[ending-style]:translate-y-2 data-[starting-style]:translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
              data-tone={toast.type}
              key={toast.id}
              toast={toast}
            >
              <StatusDot
                className="mt-[3px]"
                label={t(failed ? "toast.failed" : "toast.done")}
                shape={failed ? "barred" : "filled"}
                tone={failed ? "danger" : "ok"}
              />
              <Toast.Content className="flex min-w-0 flex-1 flex-col gap-2">
                <div>
                  <Toast.Title className="text-[13px] text-ink" />
                  <Toast.Description className="mt-1 text-[13px] text-ink-2 empty:hidden" />
                </div>
                {toast.actionProps ? (
                  <Toast.Action
                    className="self-start"
                    render={<Button size="sm" />}
                  />
                ) : null}
              </Toast.Content>
              <Toast.Close
                aria-label={t("common.close")}
                className="-mt-1 -mr-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
                title={t("common.close")}
              >
                <X className="size-4" strokeWidth={1.5} />
              </Toast.Close>
            </Toast.Root>
          )
        })}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
