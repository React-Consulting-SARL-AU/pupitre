import type { Dictionary } from "./en"
import { account } from "./strings/account"
import { admin } from "./strings/admin"
import { audit } from "./strings/audit"
import { auditUi } from "./strings/audit-ui"
import { auth } from "./strings/auth"
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

export const fr: Dictionary = {
  ...common.fr,
  ...format.fr,
  ...footer.fr,
  ...nav.fr,
  ...auth.fr,
  ...status.fr,
  ...statusPage.fr,
  ...roles.fr,
  ...audit.fr,
  ...auditUi.fr,
  ...billing.fr,
  ...billingUi.fr,
  ...download.fr,
  ...servers.fr,
  ...start.fr,
  ...members.fr,
  ...organization.fr,
  ...sidebar.fr,
  ...invites.fr,
  ...security.fr,
  ...lists.fr,
  ...settings.fr,
  ...account.fr,
  ...twoFactor.fr,
  ...table.fr,
  ...confirm.fr,
  ...admin.fr,
  ...inbox.fr,
}
