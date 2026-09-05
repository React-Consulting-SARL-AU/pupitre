import { Dialog } from "@base-ui-components/react/dialog"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"

export function DeleteAccountCard() {
  const t = useTranslations()
  const { user } = useDashboardContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [typed, setTyped] = useState("")
  const removal = useRequestCycle()
  const confirmed = typed.trim().toLowerCase() === user.email.toLowerCase()

  function remove() {
    return removal.run(async () => {
      const { error } = await authClient().deleteUser({})

      if (error) {
        throw new Error(error.message ?? t("deleteAccount.failed"))
      }

      queryClient.clear()
      await navigate({ to: "/auth/sign-in" })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("deleteAccount.title")}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <p className="text-[13px] text-ink-2">{t("deleteAccount.lead")}</p>
        <p className="text-[13px] text-ink-2">
          {t("deleteAccount.subscription")}
        </p>

        <Dialog.Root>
          <Dialog.Trigger
            render={
              <Button className="self-start" variant="danger">
                <Trash2 className="size-4" strokeWidth={1.5} />
                {t("deleteAccount.trigger")}
              </Button>
            }
          />
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px]" />
            <Dialog.Popup className="fixed top-1/2 left-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-overlay outline-none">
              <Dialog.Title className="font-bold font-display text-[16px] text-ink leading-[1.2]">
                {t("deleteAccount.dialogTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] text-ink-2">
                {t("deleteAccount.dialogDescription")}
              </Dialog.Description>

              <p className="mt-3 font-data text-[12px] text-ink">
                {user.email}
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <Label htmlFor="confirm-email">
                  {t("deleteAccount.confirmation")}
                </Label>
                <Input
                  autoComplete="off"
                  id="confirm-email"
                  onChange={(event) => {
                    setTyped(event.target.value)
                  }}
                  placeholder={user.email}
                  value={typed}
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Dialog.Close
                  render={<Button variant="ghost">{t("common.cancel")}</Button>}
                />
                <Button
                  disabled={!confirmed || removal.phase === "pending"}
                  onClick={() => {
                    remove()
                  }}
                  variant="danger"
                >
                  {removal.phase === "pending"
                    ? t("deleteAccount.pending")
                    : t("deleteAccount.confirm")}
                </Button>
              </div>

              {removal.error ? (
                <Callout
                  className="mt-4"
                  fix={t("deleteAccount.failedFix")}
                  title={removal.error}
                  tone="danger"
                />
              ) : null}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </CardBody>
    </Card>
  )
}
