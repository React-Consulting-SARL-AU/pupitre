import {
  type QueryKey,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import { apiFailure } from "@/lib/api/errors"
import type { ToastFailure } from "@/lib/domain/toast"

type Snapshot = [QueryKey, unknown][]

export interface QueryPatch<TVariables> {
  queryKey: QueryKey
  apply: (previous: unknown, variables: TVariables) => unknown
}

// Typing is lost at the cache boundary, never for the caller.
export function patchQuery<TData, TVariables = void>(
  queryKey: QueryKey,
  apply: (previous: TData, variables: TVariables) => TData
): QueryPatch<TVariables> {
  return {
    queryKey,
    apply: (previous, variables) => apply(previous as TData, variables),
  }
}

export interface MutationToast<TVariables, TData> {
  done?: (data: TData, variables: TVariables) => string
  // Fallback only: the API's own message and fix win when they exist.
  failed: (variables: TVariables) => ToastFailure
}

export interface OptimisticMutation<TVariables, TData> {
  mutationFn: (variables: TVariables) => Promise<TData>
  // Applied at once, rolled back if the call fails.
  patch?: QueryPatch<TVariables>[]
  invalidate?: QueryKey[]
  onStart?: (variables: TVariables) => void
  onDone?: (data: TData, variables: TVariables) => void | Promise<void>
  toast?: MutationToast<TVariables, TData>
}

export function useOptimisticMutation<TVariables = void, TData = unknown>({
  mutationFn,
  patch = [],
  invalidate = [],
  onStart,
  onDone,
  toast,
}: OptimisticMutation<TVariables, TData>): UseMutationResult<
  TData,
  Error,
  TVariables,
  Snapshot
> {
  const queryClient = useQueryClient()
  const toasts = useToast()
  const t = useTranslations()
  const retry = useRef<(variables: TVariables) => void>(() => undefined)

  const mutation = useMutation({
    mutationFn,

    onMutate: async (variables) => {
      const snapshot: Snapshot = []

      for (const { queryKey, apply } of patch) {
        await queryClient.cancelQueries({ queryKey })

        const previous = queryClient.getQueryData(queryKey)

        if (previous === undefined) {
          continue
        }

        snapshot.push([queryKey, previous])
        queryClient.setQueryData(queryKey, apply(previous, variables))
      }

      onStart?.(variables)

      return snapshot
    },

    onError: (error, variables, snapshot) => {
      for (const [queryKey, previous] of snapshot ?? []) {
        queryClient.setQueryData(queryKey, previous)
      }

      if (!toast) {
        return
      }

      const said = apiFailure(error)
      const fallback = toast.failed(variables)

      toasts.failed({
        title: said?.message ?? fallback.title,
        fix: said?.fix ?? fallback.fix ?? null,
        action:
          fallback.action === undefined
            ? {
                label: t("common.retry"),
                run: () => {
                  retry.current(variables)
                },
              }
            : fallback.action,
      })
    },

    onSuccess: async (data, variables) => {
      const said = toast?.done?.(data, variables)

      if (said) {
        toasts.done(said)
      }

      await onDone?.(data, variables)
    },

    onSettled: async () => {
      await Promise.all(
        invalidate.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )
    },
  })

  useEffect(() => {
    retry.current = mutation.mutate
  }, [mutation.mutate])

  return mutation
}
