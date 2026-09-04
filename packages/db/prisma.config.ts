import "dotenv/config"
import { config } from "dotenv"
import { defineConfig } from "prisma/config"

config({ path: "../../.env.local", override: false, quiet: true })

const PLACEHOLDER_DATABASE_URL =
  "postgresql://fake:fake@127.0.0.1:1/fake?sslmode=disable"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.MIGRATE_DATABASE_URL ||
      process.env.DATABASE_URL ||
      PLACEHOLDER_DATABASE_URL,
  },
})
