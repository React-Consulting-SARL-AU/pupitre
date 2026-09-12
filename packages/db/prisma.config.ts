import { defineConfig } from "prisma/config"

// D1 has no address. The only database Prisma ever opens from here is the
// shadow `scripts/new-migration.ts` builds from the migrations, to diff the
// schema against it; nothing else reads this URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.PUPITRE_MIGRATIONS_SHADOW ?? "file:./.shadow.sqlite",
  },
})
