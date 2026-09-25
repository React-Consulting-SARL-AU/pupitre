import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Outlet,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { InboxComposeDialog } from "@/components/admin/inbox/inbox-compose-dialog"
import { InboxFilterBar } from "@/components/admin/inbox/inbox-filter-bar"
import { InboxList } from "@/components/admin/inbox/inbox-list"
import { InboxMailboxRail } from "@/components/admin/inbox/inbox-mailbox-rail"
import { InboxShortcutsDialog } from "@/components/admin/inbox/inbox-shortcuts-dialog"
import { PageHeader } from "@/components/ui/page-header"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useInboxRealtime } from "@/hooks/use-inbox-realtime"
import { useInboxShortcuts } from "@/hooks/use-inbox-shortcuts"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import {
  bulkPatchThreads,
  inboxCountsQueryOptions,
  inboxKeys,
  inboxMailboxesQueryOptions,
  inboxThreadsQueryOptions,
  patchThread,
  type ThreadPageQuery,
} from "@/lib/api/inbox-queries"
import {
  INBOX_PAGE_SIZE,
  INBOX_STATUS,
  MAILBOX_AUTOMATED,
  MAILBOX_EVERY,
} from "@/lib/domain/inbox"
import { type InboxSearch, inboxSort } from "@/lib/domain/inbox-search"
import type { ListSearchHandle } from "@/lib/domain/list-search"
import { pageTitle } from "@/lib/domain/page-titles"

export const INBOX_LAYOUT_ROUTE_ID = "/dashboard/admin/inbox"

function pageQueryOf(search: InboxSearch): ThreadPageQuery {
  const mailbox = search.mailbox ?? MAILBOX_EVERY

  return {
    limit: INBOX_PAGE_SIZE,
    offset: search.offset ?? 0,
    status: search.status ?? INBOX_STATUS,
    ...(search.unread === undefined ? {} : { unread: search.unread }),
    ...(search.assigned ? { assigned: search.assigned } : {}),
    ...(search.organization_id
      ? { organization_id: search.organization_id }
      : {}),
    ...(mailbox === MAILBOX_EVERY || mailbox === MAILBOX_AUTOMATED
      ? {}
      : { mailbox_id: mailbox }),
    ...(mailbox === MAILBOX_AUTOMATED || search.automated === true
      ? { automated: true }
      : {}),
    ...(search.q ? { q: search.q } : {}),
    sort: inboxSort(search.sort),
    direction: search.direction ?? "desc",
  }
}

export type InboxWorkspaceProps = ListSearchHandle<InboxSearch>

export function InboxWorkspace({ search, setSearch }: InboxWorkspaceProps) {
  const t = useTranslations()
  const toasts = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { platformCanAct: canAct } = useDashboardContext()
  const { title, parents } = pageTitle(INBOX_LAYOUT_ROUTE_ID)
  const openThreadId = useParams({ strict: false }).threadId ?? null
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const onSettings = pathname.endsWith("/inbox/mailboxes")
  const [selected, setSelected] = useState<string[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useInboxRealtime()

  const page = useQuery(inboxThreadsQueryOptions(pageQueryOf(search)))
  const mailboxes = useQuery(inboxMailboxesQueryOptions())
  const counts = useQuery(inboxCountsQueryOptions())
  const threads = page.data?.data ?? []

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads }),
      queryClient.invalidateQueries({ queryKey: inboxKeys.counts }),
      ...(openThreadId
        ? [
            queryClient.invalidateQueries({
              queryKey: inboxKeys.thread(openThreadId),
            }),
          ]
        : []),
    ])
  }, [queryClient, openThreadId])

  const bulk = useMutation({
    mutationFn: (patch: { status?: "open" | "closed"; unread?: boolean }) =>
      bulkPatchThreads({ ids: selected, ...patch }),
    onSuccess: async (updated) => {
      setSelected([])
      toasts.done(t.plural("inbox.bulkDone", updated))
      await refresh()
    },
    onError: () => {
      toasts.failed({
        title: t("inbox.bulkFailed"),
        fix: t("common.retryLater"),
      })
    },
  })

  const change = useMutation({
    mutationFn: ({
      threadId,
      patch,
    }: {
      threadId: string
      patch: { status?: "open" | "closed"; unread?: boolean }
    }) => patchThread(threadId, patch),
    onSuccess: refresh,
    onError: () => {
      toasts.failed({
        title: t("inbox.changeFailed"),
        fix: t("common.retryLater"),
      })
    },
  })

  useEffect(() => {
    if (threads.length === 0) {
      setFocusedId(null)

      return
    }

    setFocusedId((current) =>
      current && threads.some((thread) => thread.id === current)
        ? current
        : (openThreadId ?? threads[0].id)
    )
  }, [threads, openThreadId])

  const focused = threads.find((thread) => thread.id === focusedId) ?? null
  const acted = openThreadId ?? focused?.id ?? null

  function step(offset: number) {
    const index = threads.findIndex((thread) => thread.id === focusedId)
    const next =
      threads[Math.min(Math.max(index + offset, 0), threads.length - 1)]

    if (next) {
      setFocusedId(next.id)
    }
  }

  useInboxShortcuts({
    next: () => {
      step(1)
    },
    previous: () => {
      step(-1)
    },
    open: () => {
      if (focused) {
        navigate({
          to: "/dashboard/admin/inbox/$threadId",
          params: { threadId: focused.id },
          search,
        })
      }
    },
    toggleClosed: () => {
      if (!(acted && canAct)) {
        return
      }

      const closed =
        threads.find((thread) => thread.id === acted)?.status === "closed"

      change.mutate({
        threadId: acted,
        patch: { status: closed ? "open" : "closed" },
      })
    },
    markUnread: () => {
      if (acted) {
        change.mutate({ threadId: acted, patch: { unread: true } })
      }
    },
    toggleSelected: () => {
      if (!focused) {
        return
      }

      setSelected((current) =>
        current.includes(focused.id)
          ? current.filter((id) => id !== focused.id)
          : [...current, focused.id]
      )
    },
    escape: () => {
      if (selected.length > 0) {
        setSelected([])
      } else if (openThreadId) {
        navigate({ to: "/dashboard/admin/inbox", search })
      }
    },
    help: () => {
      setShortcutsOpen(true)
    },
  })

  const list: ReactNode = (
    <InboxList
      bulkPending={bulk.isPending}
      canAct={canAct}
      failed={page.isError}
      fetching={page.isFetching}
      focusedId={focusedId}
      mailboxes={mailboxes.data ?? []}
      onBulk={(patch) => {
        bulk.mutate(patch)
      }}
      onOffsetChange={(offset) => {
        setSearch({ offset })
      }}
      onRetry={() => {
        page.refetch()
      }}
      onSelectedChange={setSelected}
      openThreadId={openThreadId}
      pending={page.isPending}
      search={search}
      selected={selected}
      threads={threads}
      total={page.data?.total ?? 0}
    />
  )

  if (onSettings || openThreadId !== null) {
    return <Outlet />
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            <InboxShortcutsDialog
              onOpenChange={setShortcutsOpen}
              open={shortcutsOpen}
            />
            {canAct ? (
              <InboxComposeDialog mailboxes={mailboxes.data ?? []} />
            ) : null}
          </>
        }
        description={
          page.data && page.data.unread > 0
            ? t.plural("inbox.unread", page.data.unread)
            : undefined
        }
        parents={parents}
        title={t(title)}
      />

      <div className="flex flex-col gap-gutter xl:flex-row">
        <InboxMailboxRail
          counts={counts.data}
          mailboxes={mailboxes.data ?? []}
          onValueChange={(mailbox) => {
            setSelected([])
            setSearch({
              mailbox: mailbox === MAILBOX_EVERY ? undefined : mailbox,
            })
          }}
          search={search}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-gutter">
          <InboxFilterBar onChange={setSearch} search={search} />

          {list}
        </div>
      </div>
    </>
  )
}
