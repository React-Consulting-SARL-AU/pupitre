import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import type { ConfirmRefusal } from "@/components/ui/confirm-form-dialog"
import { useToast } from "@/hooks/use-toast"
import { apiFailure } from "@/lib/api/errors"

export interface ConfirmMutationFailure {
  title: string
  fix?: string | null
}

export interface ConfirmMutation<Variables, Data> {
  mutationFn: (variables: Variables) => Promise<Data>
  invalidate?: QueryKey[]
  done?: (variables: Variables) => string
  failed: ConfirmMutationFailure
  onDone?: (variables: Variables) => void
}

export interface ConfirmMutationHandle<Variables> {
  run: (variables: Variables) => void
  busy: boolean
  refusal: ConfirmRefusal | null
  reset: () => void
}

// A refusal stays inside the dialog, next to what the reader typed; only success leaves a toast.
export function useConfirmMutation<Variables = void, Data = unknown>({
  mutationFn,
  invalidate = [],
  done,
  failed,
  onDone,
}: ConfirmMutation<Variables, Data>): ConfirmMutationHandle<Variables> {
  const queryClient = useQueryClient()
  const toasts = useToast()
  const mutation = useMutation({
    mutationFn,
    onSuccess: async (_data, variables) => {
      const said = done?.(variables)

      if (said) {
        toasts.done(said)
      }

      await Promise.all(
        invalidate.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )

      onDone?.(variables)
    },
  })
  const said = mutation.isError ? apiFailure(mutation.error) : null

  return {
    run: mutation.mutate,
    busy: mutation.isPending,
    refusal: mutation.isError
      ? {
          message: said?.message ?? failed.title,
          fix: said?.fix ?? failed.fix ?? null,
        }
      : null,
    reset: mutation.reset,
  }
}
