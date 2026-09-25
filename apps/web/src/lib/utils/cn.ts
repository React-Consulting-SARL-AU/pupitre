import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// `text-label` is a whole type style from the design tokens, not a text colour a later `text-*` should replace.
const twMerge = extendTailwindMerge<"text-label">({
  extend: { classGroups: { "text-label": ["text-label"] } },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
