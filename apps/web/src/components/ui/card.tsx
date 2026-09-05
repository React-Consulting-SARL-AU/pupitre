import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

export type CardProps = HTMLAttributes<HTMLDivElement>

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-lg bg-surface shadow-raised", className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-line border-b px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("font-medium text-[13px] text-ink", className)}
      {...props}
    />
  )
}

export function CardBody({ className, ...props }: CardProps) {
  return <div className={cn("px-4 py-3", className)} {...props} />
}
