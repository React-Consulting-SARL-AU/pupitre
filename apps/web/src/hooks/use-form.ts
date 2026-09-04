import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import {
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
  useForm as useReactHookForm,
} from "react-hook-form"

export interface FormOptions<Input extends FieldValues, Output>
  extends Omit<UseFormProps<Input, unknown, Output>, "resolver"> {
  schema: StandardSchemaV1<Input, Output>
}

export function useForm<Input extends FieldValues, Output = Input>({
  schema,
  ...options
}: FormOptions<Input, Output>): UseFormReturn<Input, unknown, Output> {
  return useReactHookForm<Input, unknown, Output>({
    mode: "onSubmit",
    reValidateMode: "onChange",
    resolver: standardSchemaResolver(schema),
    ...options,
  })
}
