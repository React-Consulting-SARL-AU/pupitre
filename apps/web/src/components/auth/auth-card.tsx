import type { ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

export interface AuthCardProps {
  title: string
  description: string
  children: ReactNode
  width?: "narrow" | "wide"
}

export function AuthCard({
  title,
  description,
  children,
  width = "narrow",
}: AuthCardProps) {
  return (
    <main className="flex flex-1 items-center justify-center bg-base px-6 py-12">
      <div
        className={cn(
          "w-full",
          width === "wide" ? "max-w-[560px]" : "max-w-[380px]"
        )}
      >
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-inverse font-data text-[12px] text-inverse-ink">
            &gt;_
          </span>
          <span className="font-bold font-display text-[16px] text-ink tracking-[-0.01em]">
            Pupitre
          </span>
        </div>
        <div className="rounded-md bg-surface p-6 shadow-raised">
          <h1 className="font-bold font-display text-[20px] text-ink leading-[1.2] tracking-[-0.01em]">
            {title}
          </h1>
          <p className="mt-2 mb-6 text-[13px] text-ink-2">{description}</p>
          {children}
        </div>
      </div>
    </main>
  )
}
