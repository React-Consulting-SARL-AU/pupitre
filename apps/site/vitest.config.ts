import { getViteConfig } from "astro/config"
import type { ViteUserConfig } from "vitest/config"

type AstroViteConfig = Parameters<typeof getViteConfig>[0]

const config: ViteUserConfig = {
  test: {
    include: [
      "src/**/*.test.ts",
      "scripts/**/*.test.ts",
      "worker/**/*.test.ts",
    ],
  },
}

// vitest types its config against its own vite 7 while astro bundles vite 6
export default getViteConfig(config as AstroViteConfig)
