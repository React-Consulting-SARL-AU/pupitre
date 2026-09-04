import { logoFor } from "@pupitre/design/logos"
import { type ModuleId, ModuleIdSchema } from "@pupitre/shared/catalog"
import { Boxes } from "lucide-react"
import { cn } from "@/lib/utils/cn"

export type ServiceLogoSize = 16 | 20 | 24 | 32

const BOXES: Record<ServiceLogoSize, string> = {
  16: "size-4 p-[2px]",
  20: "size-5 p-[3px]",
  24: "size-6 p-1",
  32: "size-8 p-[6px]",
}

export interface ServiceLogoProps {
  moduleId: string
  size?: ServiceLogoSize
  className?: string
}

export function ServiceLogo({
  moduleId,
  size = 20,
  className,
}: ServiceLogoProps) {
  const parsed = ModuleIdSchema.safeParse(moduleId)
  const logo = parsed.success ? logoFor(parsed.data as ModuleId) : null
  const shell = cn(
    "inline-flex shrink-0 items-center justify-center rounded-sm bg-surface [&>svg]:size-full",
    BOXES[size],
    className
  )

  if (!logo) {
    return (
      <span aria-hidden="true" className={shell}>
        <Boxes className="size-full text-ink-3" strokeWidth={1.5} />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(shell, logo.monochrome ? "text-ink" : undefined)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the markup is a build-time constant from @pupitre/design, never user input
      dangerouslySetInnerHTML={{ __html: logo.svg }}
    />
  )
}
