function portOf(variable: string, fallback: number): number {
  const value = Number(process.env[variable])

  return Number.isInteger(value) && value > 0 ? value : fallback
}

/** Another project's dev server may hold 3000 on the owner's machine: the pair moves together. */
export const HARNESS_PORT = portOf("PUPITRE_E2E_PORT", 3000)
export const VITE_PORT = HARNESS_PORT + 100
export const HARNESS_PREFIX = "/__e2e"
export const HARNESS_ORIGIN = `http://localhost:${HARNESS_PORT}`
