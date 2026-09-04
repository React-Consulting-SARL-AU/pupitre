const DEV_ORIGIN = "http://localhost:3000"

export function appOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  return import.meta.env.VITE_APP_URL ?? DEV_ORIGIN
}

export function leaveFor(url: string): void {
  window.location.assign(url)
}
