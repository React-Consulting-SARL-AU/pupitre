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
  /** One sentence in the past tense, once the server agrees. */
  done?: (variables: Variables) => string
  /** What the dialog shows when the API says nothing usable. */
  failed: ConfirmMutationFailure
  onDone?: (variables: Variables) => void
}

export interface ConfirmMutationHandle<Variables> {
  run: (variables: Variables) => void
  busy: boolean
  /** The refusal the dialog shows while it stays open with the typing intact. */
  refusal: ConfirmRefusal | null
  reset: () => void
}

/**
 * A gesture behind a confirmation: the refusal stays inside the dialog, where
 * the reader can read it against what they typed, and the success leaves a toast.
 */
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
