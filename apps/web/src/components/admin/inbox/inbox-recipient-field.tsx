import { Plus, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "@/hooks/use-locale"
import { isReadableEmail } from "@/lib/schemas/inbox"

export interface InboxRecipientFieldProps {
  id: string
  label: string
  addresses: string[]
  onAddressesChange: (addresses: string[]) => void
  disabled?: boolean
}

export function InboxRecipientField({
  id,
  label,
  addresses,
  onAddressesChange,
  disabled = false,
}: InboxRecipientFieldProps) {
  const t = useTranslations()
  const [typed, setTyped] = useState("")

  function add() {
    const address = typed.trim().toLowerCase()

    if (address === "" || !isReadableEmail(address)) {
      return
    }

    setTyped("")

    if (!addresses.includes(address)) {
      onAddressesChange([...addresses, address])
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>

      {addresses.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {addresses.map((address) => (
            <li key={address}>
              <span className="inline-flex items-center gap-1 rounded-full bg-sunken py-0.5 pr-1 pl-2.5 text-[12px] text-ink-2">
                {address}
                <button
                  aria-label={t("inbox.removeRecipient", { name: address })}
                  className="flex size-4 items-center justify-center rounded-full text-ink-3 transition-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
                  disabled={disabled}
                  onClick={() => {
                    onAddressesChange(
                      addresses.filter((entry) => entry !== address)
                    )
                  }}
                  title={t("inbox.removeRecipient", { name: address })}
                  type="button"
                >
                  <X className="size-3" strokeWidth={1.5} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          autoComplete="off"
          disabled={disabled}
          id={id}
          onChange={(event) => {
            setTyped(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              add()
            }
          }}
          placeholder={t("inbox.recipientPlaceholder")}
          value={typed}
        />
        <Button
          aria-label={t("inbox.addRecipient")}
          className="w-9 shrink-0 px-0"
          disabled={disabled}
          icon={Plus}
          onClick={add}
          title={t("inbox.addRecipient")}
        />
      </div>
    </div>
  )
}
