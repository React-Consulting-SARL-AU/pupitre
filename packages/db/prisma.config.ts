import { defineConfig } from "prisma/config"

// D1 has no URL: Prisma only opens the shadow database `scripts/new-migration.ts` builds to diff against.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.PUPITRE_MIGRATIONS_SHADOW ?? "file:./.shadow.sqlite",
  },
})
