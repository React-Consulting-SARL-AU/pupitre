import { Elysia } from "elysia"
import {
  adminInboxMailboxReadRoutes,
  adminInboxMailboxWriteRoutes,
} from "./inbox-mailboxes"
import { adminInboxNoteRoutes } from "./inbox-notes"
import { adminInboxOutboundRoutes } from "./inbox-outbound"
import {
  adminInboxTemplateReadRoutes,
  adminInboxTemplateWriteRoutes,
} from "./inbox-templates"
import { adminInboxThreadRoutes } from "./inbox-threads"

export const adminInboxRoutes = new Elysia({
  name: "admin-inbox-routes",
  prefix: "/inbox",
})
  .use(adminInboxMailboxReadRoutes)
  .use(adminInboxMailboxWriteRoutes)
  .use(adminInboxThreadRoutes)
  .use(adminInboxNoteRoutes)
  .use(adminInboxTemplateReadRoutes)
  .use(adminInboxTemplateWriteRoutes)
  .use(adminInboxOutboundRoutes)
