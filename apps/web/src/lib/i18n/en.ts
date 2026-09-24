import { account } from "./strings/account"
import { admin } from "./strings/admin"
import { audit } from "./strings/audit"
import { auditUi } from "./strings/audit-ui"
import { auth } from "./strings/auth"
import { backups } from "./strings/backups"
import { billing } from "./strings/billing"
import { billingUi } from "./strings/billing-ui"
import { common } from "./strings/common"
import { confirm } from "./strings/confirm"
import { download } from "./strings/download"
import { footer } from "./strings/footer"
import { format } from "./strings/format"
import { inbox } from "./strings/inbox"
import { invites } from "./strings/invites"
import { lists } from "./strings/lists"
import { members } from "./strings/members"
import { nav } from "./strings/nav"
import { organization } from "./strings/organization"
import { roles } from "./strings/roles"
import { security } from "./strings/security"
import { servers } from "./strings/servers"
import { settings } from "./strings/settings"
import { sidebar } from "./strings/sidebar"
import { start } from "./strings/start"
import { status } from "./strings/status"
import { statusPage } from "./strings/status-page"
import { table } from "./strings/table"
import { twoFactor } from "./strings/two-factor"

export const en = {
  ...common.en,
  ...format.en,
  ...footer.en,
  ...nav.en,
  ...auth.en,
  ...status.en,
  ...statusPage.en,
  ...roles.en,
  ...audit.en,
  ...auditUi.en,
  ...billing.en,
  ...billingUi.en,
  ...download.en,
  ...servers.en,
  ...backups.en,
  ...start.en,
  ...members.en,
  ...organization.en,
  ...sidebar.en,
  ...invites.en,
  ...security.en,
  ...lists.en,
  ...settings.en,
  ...account.en,
  ...twoFactor.en,
  ...table.en,
  ...confirm.en,
  ...admin.en,
  ...inbox.en,
}

export type Dictionary = typeof en

export type DictionaryKey = keyof Dictionary
