import { Dialog } from "@base-ui-components/react/dialog"
import { PLATFORM_SEARCH_MIN_LENGTH } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { type LinkProps, useNavigate } from "@tanstack/react-router"
import { Building2, HardDrive, Inbox, UsersRound } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import {
  type AdminSearchResults,
  adminSearchQueryOptions,
} from "@/lib/api/admin-queries"
import { searchHits } from "@/lib/domain/admin-search"
import { cn } from "@/lib/utils/cn"

export interface AdminSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEBOUNCE_MS = 200

const GROUP_ICONS = {
  users: UsersRound,
  organizations: Building2,
  servers: HardDrive,
  threads: Inbox,
} as const

const EMPTY: AdminSearchResults = {
  users: [],
  organizations: [],
  servers: [],
  threads: [],
}

export function AdminSearchDialog({
  open,
  onOpenChange,
}: AdminSearchDialogProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const [typed, setTyped] = useState("")
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(typed.trim())
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [typed])

  const results = useQuery(adminSearchQueryOptions(query))
  const hits = useMemo(
    () =>
      searchHits(
        query.length >= PLATFORM_SEARCH_MIN_LENGTH
          ? (results.data ?? EMPTY)
          : EMPTY
      ),
    [results.data, query]
  )

  function close() {
    onOpenChange(false)
    setTyped("")
    setQuery("")
    setHighlighted(0)
  }

  function go(to: LinkProps) {
    close()
    navigate(to)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (hits.length === 0) {
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlighted((current) => (current + 1) % hits.length)
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlighted((current) => (current - 1 + hits.length) % hits.length)
    }

    if (event.key === "Enter") {
      event.preventDefault()
      go(hits[Math.min(highlighted, hits.length - 1)].to)
    }
  }

  return (
    <Dialog.Root
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true)
        } else {
          close()
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px]" />
        <Dialog.Popup className="fixed top-[12vh] left-1/2 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg bg-surface shadow-overlay outline-none">
          <Dialog.Title className="sr-only">
            {t("admin.search.title")}
          </Dialog.Title>

          <div className="border-line border-b p-3">
            <Input
              aria-label={t("admin.search.title")}
              autoComplete="off"
              autoFocus
              className="border-0 bg-transparent"
              onChange={(event) => {
                setTyped(event.target.value)
                setHighlighted(0)
              }}
              onKeyDown={onKeyDown}
              placeholder={t("admin.search.placeholder")}
              type="search"
              value={typed}
            />
          </div>

          {query.length >= PLATFORM_SEARCH_MIN_LENGTH && hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-3">
              {t("admin.search.empty")}
            </p>
          ) : null}

          {hits.length > 0 ? (
            <ul className="max-h-[50vh] overflow-y-auto p-1">
              {hits.map((hit, index) => {
                const Icon = GROUP_ICONS[hit.group]

                return (
                  <li key={hit.id}>
                    <button
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-fast",
                        index === highlighted ? "bg-raised" : "hover:bg-raised"
                      )}
                      onClick={() => {
                        go(hit.to)
                      }}
                      onMouseEnter={() => {
                        setHighlighted(index)
                      }}
                      type="button"
                    >
                      <Icon
                        className="size-4 shrink-0 text-ink-3"
                        strokeWidth={1.5}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">
                          {hit.primary}
                        </span>
                        <span className="block truncate font-data text-[12px] text-ink-3">
                          {hit.secondary}
                        </span>
                      </span>
                      <StatusBadge className="shrink-0" look={hit.look} />
                      <span className="shrink-0 text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                        {t(hit.groupLabel)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
