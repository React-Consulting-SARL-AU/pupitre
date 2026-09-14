import { defineCollection, z } from "astro:content"
import { glob } from "astro/loaders"
import { LOCALES } from "./lib/i18n"

const locale = z.enum(LOCALES)

const base = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  locale,
  order: z.number().int().nonnegative().default(0),
})

const docs = defineCollection({
  loader: glob({ base: "src/content/docs", pattern: "**/*.mdx" }),
  schema: base.extend({
    section: z.string().min(1),
    sectionOrder: z.number().int().nonnegative().default(0),
  }),
})

const blog = defineCollection({
  loader: glob({ base: "src/content/blog", pattern: "**/*.mdx" }),
  schema: base.extend({
    date: z.coerce.date(),
    author: z.string().min(1),
    reading: z.string().min(1),
  }),
})

const legal = defineCollection({
  loader: glob({ base: "src/content/legal", pattern: "**/*.mdx" }),
  schema: base.extend({
    updated: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
})

export const collections = { docs, blog, legal }
